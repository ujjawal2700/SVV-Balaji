import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { AddTrainingMaterialDto } from './dto/add-training-material.dto';

@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService) {}

  createSession(dto: CreateTrainingSessionDto, conductedById: string) {
    return this.prisma.trainingSession.create({
      data: {
        title: dto.title,
        description: dto.description,
        scheduledDate: new Date(dto.scheduledDate),
        branchId: dto.branchId,
        conductedById,
      },
    });
  }

  /** `conductedById` answers "sessions I ran" without pulling the branch's. */
  findAll(user: JwtPayload, branchId?: string, conductedById?: string) {
    return this.prisma.trainingSession.findMany({
      // FRD 5.2 - the caller's branch wins over whatever was asked for.
      where: { branchId: scopedBranchId(user, branchId), conductedById },
      orderBy: { scheduledDate: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
        conductedBy: { select: { id: true, fullName: true } },
        _count: { select: { attendances: true, materials: true } },
      },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        conductedBy: { select: { id: true, fullName: true } },
        attendances: { include: { farmer: { select: { id: true, fullName: true, farmerCode: true } } } },
        materials: true,
      },
    });
    if (!session) throw new NotFoundException('Training session not found');
    return session;
  }

  async markAttendance(sessionId: string, dto: MarkAttendanceDto) {
    const session = await this.prisma.trainingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Training session not found');

    /**
     * FRD 11.2 - this replaces the attendance list, it does not append to it.
     *
     * The screen is a "who attended" multi-select seeded from the current
     * attendees, so deselecting somebody and saving plainly means "they were
     * not there". The old upsert-only version added the ids it received and
     * silently kept everyone omitted, reported success, and left a farmer
     * marked present at a session they missed - which then counted towards
     * their training history.
     *
     * Both halves run in one transaction: a moment where the list is empty
     * would be a moment where the record is wrong.
     */
    await this.prisma.$transaction([
      this.prisma.trainingAttendance.deleteMany({
        where: { sessionId, farmerId: { notIn: dto.farmerIds } },
      }),
      ...dto.farmerIds.map((farmerId) =>
        this.prisma.trainingAttendance.upsert({
          where: { sessionId_farmerId: { sessionId, farmerId } },
          update: { attended: true },
          create: { sessionId, farmerId, attended: true },
        }),
      ),
    ]);

    return this.findOne(sessionId);
  }

  async addMaterial(sessionId: string, dto: AddTrainingMaterialDto) {
    const session = await this.prisma.trainingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Training session not found');

    return this.prisma.trainingMaterial.create({
      data: { sessionId, fileUrl: dto.fileUrl, fileType: dto.fileType },
    });
  }

  async removeAttendance(sessionId: string, farmerId: string) {
    const attendance = await this.prisma.trainingAttendance.findUnique({
      where: { sessionId_farmerId: { sessionId, farmerId } },
    });
    if (!attendance) throw new NotFoundException('Attendance record not found');

    return this.prisma.trainingAttendance.delete({
      where: { sessionId_farmerId: { sessionId, farmerId } },
    });
  }

  async removeMaterial(sessionId: string, materialId: string) {
    const material = await this.prisma.trainingMaterial.findFirst({
      where: { id: materialId, sessionId },
    });
    if (!material) throw new NotFoundException('Training material not found');

    return this.prisma.trainingMaterial.delete({
      where: { id: materialId },
    });
  }

  async updateSession(
    id: string,
    dto: import('./dto/update-training-session.dto').UpdateTrainingSessionDto,
  ) {
    const session = await this.prisma.trainingSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Training session not found');

    return this.prisma.trainingSession.update({
      where: { id },
      data: {
        ...dto,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
      },
    });
  }

  async removeSession(id: string) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id },
      include: { _count: { select: { attendances: true } } },
    });
    if (!session) throw new NotFoundException('Training session not found');

    if (session._count.attendances > 0) {
      throw new BadRequestException(
        'Cannot delete training session once attendance has been marked',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.trainingMaterial.deleteMany({
        where: { sessionId: id },
      });
      return tx.trainingSession.delete({
        where: { id },
      });
    });
  }
}


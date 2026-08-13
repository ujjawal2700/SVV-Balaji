import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertDeletable } from '../common/dependants';
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

  findAll(branchId?: string) {
    return this.prisma.trainingSession.findMany({
      where: branchId ? { branchId } : undefined,
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

    await this.prisma.$transaction(
      dto.farmerIds.map((farmerId) =>
        this.prisma.trainingAttendance.upsert({
          where: { sessionId_farmerId: { sessionId, farmerId } },
          update: { attended: true },
          create: { sessionId, farmerId, attended: true },
        }),
      ),
    );

    return this.findOne(sessionId);
  }

  async addMaterial(sessionId: string, dto: AddTrainingMaterialDto) {
    const session = await this.prisma.trainingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Training session not found');

    return this.prisma.trainingMaterial.create({
      data: { sessionId, fileUrl: dto.fileUrl, fileType: dto.fileType },
    });
  }

  /**
   * Correcting a session - a retitled topic, a moved date, the wrong branch.
   * Always allowed: the session record describes an event, and attendance
   * hangs off it by id rather than by any of these fields.
   */
  async updateSession(id: string, dto: UpdateTrainingSessionDto) {
    await this.findOne(id);

    return this.prisma.trainingSession.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        branchId: dto.branchId,
      },
      include: {
        branch: { select: { id: true, name: true } },
        conductedBy: { select: { id: true, fullName: true } },
        _count: { select: { attendances: true, materials: true } },
      },
    });
  }

  /**
   * Deleting a session.
   *
   * Blocked once attendance has been marked: that is the record of which
   * farmers were trained, and FRD 11 treats it as evidence of the extension
   * work the branch has done. Materials are not a blocker - they are
   * attachments to the session and go with it.
   */
  async removeSession(id: string) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id },
      include: { _count: { select: { attendances: true } } },
    });
    if (!session) throw new NotFoundException('Training session not found');

    assertDeletable('Training session', session.title, {
      'attendance records': session._count.attendances,
    });

    await this.prisma.$transaction([
      this.prisma.trainingMaterial.deleteMany({ where: { sessionId: id } }),
      this.prisma.trainingSession.delete({ where: { id } }),
    ]);

    return { id, deleted: true };
  }

  /** Removing a farmer marked present by mistake. */
  async removeAttendance(sessionId: string, farmerId: string) {
    const attendance = await this.prisma.trainingAttendance.findUnique({
      where: { sessionId_farmerId: { sessionId, farmerId } },
    });
    if (!attendance) throw new NotFoundException('That farmer is not on this session');

    await this.prisma.trainingAttendance.delete({
      where: { sessionId_farmerId: { sessionId, farmerId } },
    });

    return this.findOne(sessionId);
  }

  async removeMaterial(sessionId: string, materialId: string) {
    const material = await this.prisma.trainingMaterial.findUnique({ where: { id: materialId } });
    if (!material || material.sessionId !== sessionId) {
      throw new NotFoundException('Material not found on this session');
    }

    await this.prisma.trainingMaterial.delete({ where: { id: materialId } });
    return this.findOne(sessionId);
  }
}

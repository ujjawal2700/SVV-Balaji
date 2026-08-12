/**
 * Password recovery / inspection utility.
 *
 * The password lives as a bcrypt hash in the `users` table. Nothing in `.env`
 * can change it after the account exists, which makes "I edited .env and now I
 * cannot sign in" a very easy hole to fall into. This is the way out, and it
 * takes the password as an argument so there is no environment indirection to
 * get wrong.
 *
 *   List every account, with role and status:
 *     npm run admin:password
 *
 *   Set a password:
 *     npm run admin:password -- admin@svvbalaji.com "admin@123"
 *
 * Quote the password. Shells eat characters like @, !, & and ^ otherwise -
 * cmd.exe in particular treats ^ as an escape.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { email: true, fullName: true, role: true, status: true, createdAt: true },
  });

  if (users.length === 0) {
    console.log('There are no users in this database at all.');
    console.log('Run `npm run prisma:seed` to create the Super Admin.');
    console.log('');
    console.log('If you expected users here, you may be pointed at a different database -');
    console.log('check DATABASE_URL in .env.');
    return;
  }

  console.log(`${users.length} user(s) in this database:\n`);
  for (const user of users) {
    const flag = user.status === 'ACTIVE' ? ' ' : '!';
    console.log(
      `${flag} ${user.email.padEnd(32)} ${user.role.padEnd(20)} ${user.status.padEnd(10)} ${user.fullName}`,
    );
  }
  console.log('');
  console.log('A user marked ! is not ACTIVE and will be refused at login regardless of password.');
  console.log('');
  console.log('To set a password:');
  console.log('  npm run admin:password -- <email> "<newPassword>"');
}

async function setPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`No user with the email ${email}.`);
    console.error('');
    console.error('Run `npm run admin:password` with no arguments to see what does exist.');
    console.error('Note that seeding a NEW email creates a second account rather than');
    console.error('renaming the first - it is easy to end up with two.');
    process.exitCode = 1;
    return;
  }

  const alreadyMatches = await bcrypt.compare(password, user.passwordHash);

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      // A live session must not outlive the password it was issued under.
      refreshTokenHash: null,
      // A non-ACTIVE user is refused at login no matter what the password is,
      // so recovering the password without this would look like it had failed.
      status: 'ACTIVE',
    },
  });

  console.log(`Password set for ${email}.`);
  if (alreadyMatches) {
    console.log('');
    console.log('Note: that password ALREADY matched the stored hash before this ran.');
    console.log('If sign-in was failing, the password was not the problem. Check that:');
    console.log('  - you are signing in with this exact email');
    console.log('  - the panel is pointed at this API (VITE_API_BASE_URL)');
    console.log('  - the API is pointed at this database (DATABASE_URL)');
  } else {
    console.log(`Sign in with ${email} and the password you just set.`);
  }
  if (user.status !== 'ACTIVE') {
    console.log(`(The account was ${user.status} and has been set to ACTIVE.)`);
  }
}

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email) {
    await listUsers();
    return;
  }

  if (!password) {
    console.error('A password is required.');
    console.error('  npm run admin:password -- <email> "<newPassword>"');
    process.exitCode = 1;
    return;
  }

  if (password.length < 6) {
    // Matches the MinLength(6) on CreateUserDto - no point setting something
    // the API would reject if the user were created through it.
    console.error('Password must be at least 6 characters.');
    process.exitCode = 1;
    return;
  }

  await setPassword(email, password);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

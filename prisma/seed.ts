import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed Pickle Balls.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const people = [
  {
    email: "zayd@pickleballs.local",
    name: "Zayd",
    initials: "ZK",
    avatarColor: "lime",
  },
  {
    email: "david@pickleballs.local",
    name: "David",
    initials: "DG",
    avatarColor: "orange",
  },
  {
    email: "eddie@pickleballs.local",
    name: "Eddie",
    initials: "ET",
    avatarColor: "blue",
  },
  {
    email: "khalid@pickleballs.local",
    name: "Khalid",
    initials: "KJ",
    avatarColor: "pink",
  },
];

async function main() {
  const circle = await prisma.circle.upsert({
    where: { inviteCode: "PICKLE-BALLS-04" },
    update: { name: "Pickle Balls" },
    create: { name: "Pickle Balls", inviteCode: "PICKLE-BALLS-04" },
  });

  for (const [index, person] of people.entries()) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: person,
      create: person,
    });

    await prisma.membership.upsert({
      where: {
        userId_circleId: {
          userId: user.id,
          circleId: circle.id,
        },
      },
      update: { role: index === 0 ? "OWNER" : "MEMBER" },
      create: {
        userId: user.id,
        circleId: circle.id,
        role: index === 0 ? "OWNER" : "MEMBER",
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

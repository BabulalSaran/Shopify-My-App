import { PrismaClient } from "@prisma/client";

const defaultDbUrl =
  "postgresql://neondb_owner:npg_jl2SDuO9LRNV@ep-dawn-dust-axli1srx-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = defaultDbUrl;
}

const createPrismaClient = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || defaultDbUrl,
      },
    },
  });
};

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrismaClient();
  }
}

const prisma = global.prismaGlobal ?? createPrismaClient();

export default prisma;

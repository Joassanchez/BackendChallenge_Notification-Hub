import type { PrismaClient } from "../../../generated/prisma/client.js";
import { RoleCode } from "../../../generated/prisma/client.js";

const userWithRoles = {
  roles: {
    include: {
      role: true,
    },
  },
} as const;

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  findByIdWithRoles(id: string) {
    return this.db.user.findFirst({
      where: {
        id,
        isActive: true,
      },
      include: userWithRoles,
    });
  }

  findByIdentifierWithRoles(identifier: string) {
    return this.db.user.findFirst({
      where: {
        isActive: true,
        OR: [{ username: identifier }, { email: identifier }],
      },
      include: userWithRoles,
    });
  }

  updateLastLoginAt(userId: string, date: Date) {
    return this.db.user.update({
      where: { id: userId },
      data: { lastLoginAt: date },
    });
  }

  async createWithDefaultRole(input: { username: string; email?: string; passwordHash: string }) {
    const userId = await this.db.$transaction(async (transaction) => {
      const role = await transaction.role.findUniqueOrThrow({
        where: { code: RoleCode.USER },
      });

      const user = await transaction.user.create({
        data: {
          username: input.username,
          email: input.email ?? null,
          passwordHash: input.passwordHash,
          roles: {
            create: {
              roleId: role.id,
            },
          },
        },
        select: {
          id: true,
        },
      });

      return user.id;
    });

    const user = await this.findByIdWithRoles(userId);

    if (user === null) {
      throw new Error("Created user could not be loaded");
    }

    return user;
  }
}

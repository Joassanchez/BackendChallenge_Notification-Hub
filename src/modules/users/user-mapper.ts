import type { Prisma } from "../../generated/prisma/client.js";

export type UserWithRoles = Prisma.UserGetPayload<{
  include: {
    roles: {
      include: {
        role: true;
      };
    };
  };
}>;

export type SafeUserDto = {
  id: string;
  username: string;
  email: string | null;
  roles: Array<"USER" | "ADMIN">;
};

export function toSafeUserDto(user: UserWithRoles): SafeUserDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    roles: user.roles.map((userRole) => userRole.role.code),
  };
}

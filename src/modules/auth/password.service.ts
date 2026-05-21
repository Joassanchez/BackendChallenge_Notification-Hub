import bcrypt from "bcrypt";

const PASSWORD_HASH_ROUNDS = 10;

export class PasswordService {
  hash(password: string): Promise<string> {
    return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
  }

  compare(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}

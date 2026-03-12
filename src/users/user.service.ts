import { DatabaseService } from '../database/database.service';
import { Injectable, Logger } from '@nestjs/common';
import { Role, User } from '@prisma/client';

const PAGE_SIZE = 20;

interface UpsertData {
  username?: string;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly db: DatabaseService) {}

  public async upsert(telegramId: number, data: UpsertData): Promise<User> {
    return this.db.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: {
        username: data.username ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
      },
      create: {
        telegramId: BigInt(telegramId),
        username: data.username ?? null,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
      },
    });
  }

  public async findByTelegramId(telegramId: number): Promise<User | null> {
    return this.db.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });
  }

  public async findByUsername(username: string): Promise<User | null> {
    return this.db.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
  }

  public async ban(telegramId: number, reason?: string): Promise<User | null> {
    const user = await this.findByTelegramId(telegramId);

    if (!user) return null;

    const updated = await this.db.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: { isBanned: true, banReason: reason ?? null, bannedAt: new Date() },
    });

    this.logger.log(`User ${telegramId} banned${reason ? `: ${reason}` : ''}`);

    return updated;
  }

  public async unban(telegramId: number): Promise<User | null> {
    const user = await this.findByTelegramId(telegramId);

    if (!user) return null;

    const updated = await this.db.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: { isBanned: false, banReason: null, bannedAt: null },
    });

    this.logger.log(`User ${telegramId} unbanned`);

    return updated;
  }

  public async setRole(telegramId: number, role: Role): Promise<User | null> {
    const user = await this.findByTelegramId(telegramId);

    if (!user) return null;

    return this.db.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: { role },
    });
  }

  public async list(
    page: number,
  ): Promise<{ users: User[]; total: number; pages: number }> {
    const [users, total] = await this.db.$transaction([
      this.db.user.findMany({
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
      }),

      this.db.user.count(),
    ]);

    return { users, total, pages: Math.ceil(total / PAGE_SIZE) };
  }

  public async ensureAdmin(telegramId: number): Promise<void> {
    const existing = await this.findByTelegramId(telegramId);

    if (!existing) {
      await this.db.user.create({
        data: { telegramId: BigInt(telegramId), role: Role.ADMIN },
      });

      this.logger.log(`Admin user ${telegramId} created`);

      return;
    }

    if (existing.role !== Role.ADMIN) {
      await this.db.user.update({
        where: { telegramId: BigInt(telegramId) },
        data: { role: Role.ADMIN },
      });

      this.logger.log(`User ${telegramId} promoted to admin`);
    }
  }
}

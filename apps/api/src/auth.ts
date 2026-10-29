import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Database } from './db.js';
import { verifyPassword } from './password.js';
import { parse } from './validation.js';

export const SESSION_COOKIE = 'hhs_session';
const lifetime = 8 * 60 * 60 * 1000;
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function sessionToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
    ? token
    : undefined;
}
export function requireBrowserWrite(req: Request) {
  // No CORS is enabled: another origin cannot send this custom header.
  // The Next proxy additionally verifies Origin against its own origin.
  if (req.get('x-hhs-csrf') !== '1' || !req.is('application/json')) {
    throw new ForbiddenException('Запит відхилено. Оновіть сторінку.');
  }
}
export type AdminRequest = Request & { admin: { id: string; email: string } };
@Injectable()
export class AuthService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async current(req: Request) {
    const token = sessionToken(req);
    if (!token)
      throw new UnauthorizedException('Увійдіть до адміністративної частини.');
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(token) },
      include: { admin: { select: { id: true, email: true } } },
    });
    if (!session || session.expiresAt <= new Date())
      throw new UnauthorizedException('Сеанс завершено. Увійдіть знову.');
    return session.admin;
  }
  private async throttle(key: string, limit: number, windowMs: number) {
    const now = new Date();
    const until = new Date(now.getTime() + windowMs);
    const rows = await this.db.$queryRaw<{ attempts: number }[]>`
      INSERT INTO "LoginThrottle" ("key", "attempts", "expiresAt") VALUES (${key}, 1, ${until})
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "LoginThrottle"."expiresAt" <= ${now} THEN 1 ELSE "LoginThrottle"."attempts" + 1 END,
        "expiresAt" = CASE WHEN "LoginThrottle"."expiresAt" <= ${now} THEN ${until} ELSE "LoginThrottle"."expiresAt" END
      RETURNING "attempts"`;
    if (rows[0].attempts > limit)
      throw new HttpException('Забагато спроб входу. Спробуйте пізніше.', 429);
  }
  async login(body: unknown, req: Request, res: Response) {
    requireBrowserWrite(req);
    const input = parse(
      z
        .object({
          email: z
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          password: z.string().min(1).max(200),
        })
        .strict(),
      body,
    );
    await this.throttle('global', 60, 60_000);
    await this.throttle(`email:${digest(input.email)}`, 5, 15 * 60_000);
    await this.db.loginThrottle.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } },
    });
    const admin = await this.db.admin.findUnique({
      where: { email: input.email },
    });
    // Same expensive check for unknown accounts avoids a fast enumeration path.
    const dummy = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const valid = await verifyPassword(
      input.password,
      admin?.passwordHash ?? dummy,
    );
    if (!admin || !valid)
      throw new UnauthorizedException('Невірна електронна пошта або пароль.');
    const token = randomBytes(32).toString('hex');
    const previous = sessionToken(req);
    await this.db.$transaction(async (tx) => {
      if (previous)
        await tx.session.deleteMany({ where: { tokenHash: digest(previous) } });
      await tx.session.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      });
      await tx.session.create({
        data: {
          tokenHash: digest(token),
          adminId: admin.id,
          expiresAt: new Date(Date.now() + lifetime),
        },
      });
    });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: lifetime,
    });
    return { id: admin.id, email: admin.email };
  }
  async logout(req: Request, res: Response) {
    requireBrowserWrite(req);
    const token = sessionToken(req);
    if (token)
      await this.db.session.deleteMany({ where: { tokenHash: digest(token) } });
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    return { ok: true };
  }
}
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    if (!['GET', 'HEAD'].includes(req.method)) requireBrowserWrite(req);
    req.admin = await this.auth.current(req);
    return true;
  }
}
@Controller('admin/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('login')
  @HttpCode(200)
  login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(body, req, res);
  }
  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: AdminRequest) {
    return req.admin;
  }
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }
}

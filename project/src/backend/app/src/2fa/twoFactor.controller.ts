import {
	Controller,
	Post,
	Res,
	UseGuards,
	Req,
	Body,
	UnauthorizedException,
	ForbiddenException,
} from '@nestjs/common';
import { AuthMiddleware } from 'src/users/users.middleware';
import { TwoFactorAuthenticationService } from './twoFactor.service';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { RequestWithUser } from 'src/interfaces/request-with-user.interface';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from 'src/users/users.service';
import { AuthService } from '../auth/auth.service';
import { UserStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';

@Controller('2fa')
@ApiTags('2fa')
export class TwoFactorAuthenticationController {
	constructor(
		private readonly twoFactorAuthenticationService: TwoFactorAuthenticationService,
		private authMiddleware: AuthMiddleware,
		private usersService: UsersService,
		private authService: AuthService
	) { }

	@Post('generate')
	@UseGuards(AuthGuard)
	async register(@Res() res: Response, @Req() request: RequestWithUser) {
		const user = request.user;
		if (!user) {
			res.status(401).send({ message: 'Unauthorized' });
		  } else {
			const { otpauthUrl } = await this.twoFactorAuthenticationService.generateTwoFactorAuthenticationSecret(request.user);

			const ret = await this.twoFactorAuthenticationService.pipeQrCodeStream(res, otpauthUrl);

			res.send({ ret });
		  }
	}

	@Post('turn-on')
	@UseGuards(AuthGuard)
	async turnOnTwoFactorAuthentication(
		@Req() request: RequestWithUser,
		@Res() res: Response,
		@Body() body: { tfa_code: string }
	) {
		const user = request.user;

    	const isCodeValid = this.twoFactorAuthenticationService.isTwoFactorAuthenticationCodeValid(
      		body.tfa_code, user
    	);
		if (!isCodeValid) {
			res.status(206).send({ user });
			return;
		}
		await this.usersService.turnOnTwoFactorAuthentication(user.id);

		user.twofaenabled = true;

		res.status(200).send({ user });
	}

	@Post('turn-off')
	@UseGuards(AuthGuard)
	async turnOffTwoFactorAuthentication(
		@Req() request: RequestWithUser,
		@Res() res: Response
	) {
		const user = request.user;
		await this.usersService.turnOffTwoFactorAuthentication(user.id);

		user.twofaenabled = false;
		user.twofasecret = null;

		res.status(200).send({ user });
	}

	@Post('authenticate')
	@UseGuards(AuthGuard)
	async authenticate(
		@Req() request: RequestWithUser,
		@Res() res: Response,
		@Body() body: { tfa_code: string }
	) {

		if (!request.cookies[process.env.JWT_TMP_NAME])
			return

		const user = request.user;

		const isCodeValid = this.twoFactorAuthenticationService.isTwoFactorAuthenticationCodeValid(
			body.tfa_code, request.user
		);
		if (!isCodeValid) {
			throw new UnauthorizedException('Wrong authentication code');
		}
		
		// Set jwt cookie with 2fa
		const token = this.authService.createToken(user, true);

		// Check token
		if (!token) {
		throw new ForbiddenException('Forbidden, token is missing.');
		}
		
		res.clearCookie(process.env.JWT_TMP_NAME);
		
		this.usersService.updateUserStatus(user.id, UserStatus.ONLINE);

		// Set jwt cookie
		res.cookie(process.env.JWT_NAME, token, {
			httpOnly: true,
			secure: false,
			sameSite: 'lax',
			maxAge: 86400000, // 1 day
		});
	
		res.status(201).send({ user });
	}
}
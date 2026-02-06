import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  private rawParser = bodyParser.raw({ type: 'application/json' });

  use(req: Request, res: Response, next: NextFunction) {
    this.rawParser(req, res, (err) => {
      if (err) return next(err);

      // Expose raw body explicitly
      (req as any).rawBody = req.body;
      next();
    });
  }
}

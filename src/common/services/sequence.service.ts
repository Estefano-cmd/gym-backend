import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async nextCode(name: string, padLength = 4): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.sequenceCounter.update({
        where: { name },
        data: { lastValue: { increment: 1 } },
      });
      return `${counter.prefix}${String(counter.lastValue).padStart(padLength, '0')}`;
    });
  }
}

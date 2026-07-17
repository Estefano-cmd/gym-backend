import { ClientStatus, Prisma } from '@prisma/client';
import {
  computeAccessStatus,
  computeClientStatus,
} from './date.util';

type Tx = Prisma.TransactionClient;

export async function syncClientCoverage(tx: Tx, clientId: string): Promise<void> {
  const client = await tx.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  if (client.status === ClientStatus.SUSPENDED) {
    await tx.client.update({
      where: { id: clientId },
      data: {
        accessStatus: 'DENIED',
      },
    });
    return;
  }

  const payments = await tx.membershipPayment.findMany({
    where: { clientId, status: 'CONFIRMED' },
    orderBy: { coverageEndDate: 'desc' },
  });

  if (payments.length === 0) {
    const status =
      client.status === ClientStatus.INACTIVE
        ? ClientStatus.INACTIVE
        : ClientStatus.INACTIVE;

    await tx.client.update({
      where: { id: clientId },
      data: {
        coverageStartDate: null,
        coverageEndDate: null,
        lastPaymentDate: null,
        currentPlanId: null,
        accessStatus: 'DENIED',
        status,
      },
    });
    return;
  }

  const latest = payments[0];
  const earliest = payments.reduce(
    (min, p) => (p.coverageStartDate < min.coverageStartDate ? p : min),
    payments[0],
  );

  const coverageEndDate = latest.coverageEndDate;
  const status = computeClientStatus('ACTIVE', coverageEndDate) as ClientStatus;
  const accessStatus = computeAccessStatus('ACTIVE', coverageEndDate);

  await tx.client.update({
    where: { id: clientId },
    data: {
      coverageStartDate: earliest.coverageStartDate,
      coverageEndDate,
      lastPaymentDate: latest.paymentDate,
      currentPlanId: latest.planId,
      accessStatus,
      status,
    },
  });
}

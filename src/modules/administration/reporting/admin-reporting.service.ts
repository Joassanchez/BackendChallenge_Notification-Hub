import { MessageStatus, ProviderCode, type DeliveryStatus } from "../../../generated/prisma/client.js";
import type {
  AdminReportingMessage,
  AdminReportingMessageFilters,
  AdminReportingRepository,
} from "./admin-reporting.repository.js";

export type AdminMessageDeliveryDto = {
  id: string;
  provider: ProviderCode;
  targetType: string;
  externalTargetId: string;
  status: DeliveryStatus;
  attemptsCount: number;
};

export type AdminMessageDto = {
  id: string;
  userId: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  deliveries: AdminMessageDeliveryDto[];
};

type AdminReportingStore = Pick<AdminReportingRepository, "listMessages">;

export class AdminReportingService {
  constructor(private readonly reports: AdminReportingStore) {}

  async listMessages(filters: AdminReportingMessageFilters): Promise<AdminMessageDto[]> {
    const messages = await this.reports.listMessages(filters);

    return messages.map(toAdminMessageDto);
  }
}

function toAdminMessageDto(message: AdminReportingMessage): AdminMessageDto {
  return {
    id: message.id,
    userId: message.userId,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    deliveries: message.deliveries.map((delivery) => ({
      id: delivery.id,
      provider: delivery.provider.code,
      targetType: delivery.target.targetType,
      externalTargetId: delivery.target.externalTargetId,
      status: delivery.status,
      attemptsCount: delivery.attemptCount,
    })),
  };
}

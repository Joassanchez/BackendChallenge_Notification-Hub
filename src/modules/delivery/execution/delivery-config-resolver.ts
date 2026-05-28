import { Prisma } from "../../../generated/prisma/client.js";

export type DeliveryConfigSource = {
  id: string;
  config: Prisma.JsonValue | null;
  secretRef: string | null;
};

export type DeliveryConfigResolution =
  | {
      ok: true;
      connectionId: string;
      connectionConfig: Prisma.JsonValue | null;
      resolvedSecret: string | null;
    }
  | {
      ok: false;
      errorCode: "MISSING_SECRET";
      errorMessage: string;
    };

export class DeliveryConfigResolver {
  resolve(connection: DeliveryConfigSource): DeliveryConfigResolution {
    if (connection.secretRef === null) {
      return {
        ok: true,
        connectionId: connection.id,
        connectionConfig: connection.config,
        resolvedSecret: null,
      };
    }

    const resolvedSecret = process.env[connection.secretRef];

    if (resolvedSecret === undefined || resolvedSecret.trim() === "") {
      return {
        ok: false,
        errorCode: "MISSING_SECRET",
        errorMessage: "Provider secret is not configured",
      };
    }

    return {
      ok: true,
      connectionId: connection.id,
      connectionConfig: connection.config,
      resolvedSecret,
    };
  }
}

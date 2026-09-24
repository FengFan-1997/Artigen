export type DesignExecutionAssetLink = {
  clientId: string;
  assetId: string;
};

export type DesignExecutionAssetInputs = {
  clientIds: string[];
  assetIds: string[];
  uploadClientIds: string[];
  missingClientIds: string[];
};

const attachmentsRequiredError = () => Object.assign(
  new Error('DESIGN_ATTACHMENTS_REQUIRED'),
  { code: 'DESIGN_ATTACHMENTS_REQUIRED' }
);

export const resolveDesignExecutionAssetInputs = (input: {
  clientIds: string[];
  uploads: DesignExecutionAssetLink[];
  availableClientIds: string[];
}): DesignExecutionAssetInputs => {
  const clientIds = [...new Set(input.clientIds.map((value) => String(value || '').trim()).filter(Boolean))];
  const assetsByClientId = new Map(
    input.uploads
      .filter((upload) => upload.clientId && upload.assetId)
      .map((upload) => [upload.clientId, upload.assetId])
  );
  const availableClientIds = new Set(input.availableClientIds);
  const assetIds: string[] = [];
  const uploadClientIds: string[] = [];
  const missingClientIds: string[] = [];

  for (const clientId of clientIds) {
    const assetId = assetsByClientId.get(clientId);
    if (assetId) {
      assetIds.push(assetId);
    } else if (availableClientIds.has(clientId)) {
      uploadClientIds.push(clientId);
    } else {
      missingClientIds.push(clientId);
    }
  }

  return { clientIds, assetIds, uploadClientIds, missingClientIds };
};

export const prepareDesignExecutionAssetIds = async (input: {
  clientIds: string[];
  uploads: DesignExecutionAssetLink[];
  availableClientIds: string[];
  uploadMissing: (clientIds: string[]) => Promise<DesignExecutionAssetLink[]>;
}) => {
  let resolved = resolveDesignExecutionAssetInputs(input);
  if (resolved.missingClientIds.length) throw attachmentsRequiredError();

  if (resolved.uploadClientIds.length) {
    const uploaded = await input.uploadMissing(resolved.uploadClientIds);
    const uploadedClientIds = new Set(uploaded.map((item) => item.clientId));
    if (resolved.uploadClientIds.some((clientId) => !uploadedClientIds.has(clientId))) {
      throw attachmentsRequiredError();
    }
    resolved = resolveDesignExecutionAssetInputs({
      clientIds: resolved.clientIds,
      uploads: [...input.uploads, ...uploaded],
      availableClientIds: []
    });
  }

  if (resolved.missingClientIds.length || resolved.uploadClientIds.length) {
    throw attachmentsRequiredError();
  }
  return resolved.assetIds;
};

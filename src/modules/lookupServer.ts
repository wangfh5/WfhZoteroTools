type LookupIdentifier = {
  DOI?: string;
  ISBN?: string;
  PMID?: string | string[];
  arXiv?: string;
  adsBibcode?: string;
};

type LookupRequest = {
  identifier: string;
  collectionKey?: string;
  saveAttachments: boolean;
  alsoFindPDF: boolean;
  tags: string[];
  note?: string;
};

class LookupEndpointError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message);
    this.name = "LookupEndpointError";
  }
}

export class LookupServerFactory {
  static endpointPath = "/wfh/lookupIdentifier";

  static register() {
    ztoolkit.log(
      `WfhZoteroTools/Lookup: Registering endpoint ${LookupServerFactory.endpointPath}`,
    );

    const endpoint = function () {} as any;
    endpoint.prototype = {
      supportedMethods: ["POST"],
      supportedDataTypes: ["application/json"],
      permitBookmarklet: false,
      init: LookupServerFactory.handle,
    };

    (Zotero as any).Server.Endpoints[LookupServerFactory.endpointPath] =
      endpoint;
  }

  static unregister() {
    ztoolkit.log(
      `WfhZoteroTools/Lookup: Unregistering endpoint ${LookupServerFactory.endpointPath}`,
    );
    delete (Zotero as any).Server.Endpoints[LookupServerFactory.endpointPath];
  }

  static async handle(requestData: any) {
    try {
      const request = LookupServerFactory.parseRequest(requestData);
      const identifiers = LookupServerFactory.extractIdentifiers(
        request.identifier,
      );

      if (!identifiers.length) {
        return LookupServerFactory.jsonResponse(400, {
          error: "NO_IDENTIFIERS_FOUND",
        });
      }

      const { libraryID, collections } = LookupServerFactory.resolveTarget(
        request.collectionKey,
      );
      const lookupIdentifiers =
        LookupServerFactory.chunkPMIDIdentifiers(identifiers);

      ztoolkit.log("WfhZoteroTools/Lookup: Starting lookup", {
        identifierCount: lookupIdentifiers.length,
        libraryID,
        collections,
        saveAttachments: request.saveAttachments,
        alsoFindPDF: request.alsoFindPDF,
      });

      const newItems: Zotero.Item[] = [];
      for (const identifier of lookupIdentifiers) {
        try {
          const items = await LookupServerFactory.translateIdentifier(
            identifier,
            libraryID,
            collections,
            request.saveAttachments,
          );
          newItems.push(...items);
        } catch (error) {
          ztoolkit.log("WfhZoteroTools/Lookup: Identifier lookup failed", {
            identifier: LookupServerFactory.identifierToString(identifier),
            error,
          });
          Zotero.logError(LookupServerFactory.toError(error));
        }
      }

      if (!newItems.length) {
        return LookupServerFactory.jsonResponse(404, {
          error: "NO_RESULTS",
          identifiers: lookupIdentifiers.map((identifier) =>
            LookupServerFactory.identifierToString(identifier),
          ),
        });
      }

      await LookupServerFactory.postProcessItems(newItems, request);

      const items = await Promise.all(
        newItems.map((item) => LookupServerFactory.serializeItem(item)),
      );

      ztoolkit.log("WfhZoteroTools/Lookup: Lookup completed", {
        itemCount: items.length,
      });

      return LookupServerFactory.jsonResponse(201, { items });
    } catch (error) {
      if (error instanceof LookupEndpointError) {
        ztoolkit.log("WfhZoteroTools/Lookup: Request rejected", {
          code: error.code,
          message: error.message,
        });
        return LookupServerFactory.jsonResponse(error.status, {
          error: error.code,
          ...(error.message ? { message: error.message } : {}),
        });
      }

      ztoolkit.log("WfhZoteroTools/Lookup: Unhandled error", error);
      Zotero.logError(LookupServerFactory.toError(error));
      return LookupServerFactory.jsonResponse(500, {
        error: "LOOKUP_IDENTIFIER_FAILED",
        message: LookupServerFactory.getErrorMessage(error),
      });
    }
  }

  static parseRequest(requestData: any): LookupRequest {
    if (!requestData || typeof requestData !== "object") {
      throw new LookupEndpointError(
        400,
        "INVALID_REQUEST",
        "JSON body required",
      );
    }

    const data =
      requestData.data && typeof requestData.data === "object"
        ? requestData.data
        : requestData;

    if (typeof data.identifier !== "string") {
      throw new LookupEndpointError(
        400,
        "INVALID_REQUEST",
        "`identifier` must be a string",
      );
    }

    if (
      data.collectionKey !== undefined &&
      typeof data.collectionKey !== "string"
    ) {
      throw new LookupEndpointError(
        400,
        "INVALID_REQUEST",
        "`collectionKey` must be a string",
      );
    }

    if (
      data.saveAttachments !== undefined &&
      typeof data.saveAttachments !== "boolean"
    ) {
      throw new LookupEndpointError(
        400,
        "INVALID_REQUEST",
        "`saveAttachments` must be a boolean",
      );
    }

    if (
      data.alsoFindPDF !== undefined &&
      typeof data.alsoFindPDF !== "boolean"
    ) {
      throw new LookupEndpointError(
        400,
        "INVALID_REQUEST",
        "`alsoFindPDF` must be a boolean",
      );
    }

    if (data.tags !== undefined && !Array.isArray(data.tags)) {
      throw new LookupEndpointError(
        400,
        "INVALID_REQUEST",
        "`tags` must be an array of strings",
      );
    }

    if (
      Array.isArray(data.tags) &&
      data.tags.some((tag: unknown) => typeof tag !== "string")
    ) {
      throw new LookupEndpointError(
        400,
        "INVALID_REQUEST",
        "`tags` must be an array of strings",
      );
    }

    if (data.note !== undefined && typeof data.note !== "string") {
      throw new LookupEndpointError(
        400,
        "INVALID_REQUEST",
        "`note` must be a string",
      );
    }

    return {
      identifier: data.identifier,
      collectionKey: data.collectionKey?.trim() || undefined,
      saveAttachments: data.saveAttachments ?? true,
      alsoFindPDF: data.alsoFindPDF ?? false,
      tags: (data.tags ?? []).map((tag: string) => tag.trim()).filter(Boolean),
      note: data.note?.trim() || undefined,
    };
  }

  static extractIdentifiers(identifierText: string): LookupIdentifier[] {
    const identifiers = (Zotero.Utilities as any).extractIdentifiers(
      identifierText,
    ) as LookupIdentifier[];

    ztoolkit.log("WfhZoteroTools/Lookup: Extracted identifiers", identifiers);
    return identifiers;
  }

  static chunkPMIDIdentifiers(
    identifiers: LookupIdentifier[],
  ): LookupIdentifier[] {
    if (!identifiers.length || !identifiers[0].PMID) {
      return identifiers;
    }

    const chunkSize = 200;
    const chunks: LookupIdentifier[] = [];
    for (let i = 0; i < identifiers.length; i += chunkSize) {
      chunks.push({
        PMID: identifiers
          .slice(i, i + chunkSize)
          .map((item) => item.PMID)
          .filter((pmid): pmid is string => typeof pmid === "string"),
      });
    }
    return chunks;
  }

  static resolveTarget(collectionKey?: string) {
    if (!collectionKey) {
      const library = Zotero.Libraries.userLibrary;
      if (!library?.editable) {
        throw new LookupEndpointError(
          500,
          "LIBRARY_NOT_EDITABLE",
          "My Library is not editable",
        );
      }
      return {
        libraryID: library.libraryID,
        collections: false as number[] | false,
      };
    }

    for (const library of Zotero.Libraries.getAll()) {
      if (!library.editable) {
        continue;
      }

      const collection = Zotero.Collections.getByLibraryAndKey(
        library.libraryID,
        collectionKey,
      );
      if (collection) {
        return {
          libraryID: library.libraryID,
          collections: [collection.id],
        };
      }
    }

    throw new LookupEndpointError(400, "COLLECTION_NOT_FOUND");
  }

  static async translateIdentifier(
    identifier: LookupIdentifier,
    libraryID: number,
    collections: number[] | false,
    saveAttachments: boolean,
  ) {
    ztoolkit.log("WfhZoteroTools/Lookup: Translating identifier", {
      identifier: LookupServerFactory.identifierToString(identifier),
      libraryID,
      collections,
      saveAttachments,
    });

    const translate = new (Zotero.Translate as any).Search();
    translate.setIdentifier(identifier);

    const translators = await translate.getTranslators();
    if (!translators?.length) {
      throw new Error(
        `No translators found for ${LookupServerFactory.identifierToString(identifier)}`,
      );
    }

    translate.setTranslator(translators);

    return (await translate.translate({
      libraryID,
      collections,
      saveAttachments,
    })) as Zotero.Item[];
  }

  static async postProcessItems(items: Zotero.Item[], request: LookupRequest) {
    for (const item of items) {
      if (request.alsoFindPDF) {
        await LookupServerFactory.findAvailableFile(item);
      }

      if (request.tags.length) {
        for (const tag of request.tags) {
          item.addTag(tag);
        }
        await item.saveTx();
      }

      if (request.note) {
        const noteItem = new Zotero.Item("note");
        noteItem.libraryID = item.libraryID;
        noteItem.parentID = item.id;
        noteItem.setNote(request.note);
        await noteItem.saveTx();
      }
    }
  }

  static async findAvailableFile(item: Zotero.Item) {
    const attachmentsAPI = (Zotero as any).Attachments;
    if (!attachmentsAPI.canFindFileForItem(item)) {
      ztoolkit.log("WfhZoteroTools/Lookup: Skipping file lookup", {
        itemID: item.id,
        title: item.getField("title"),
      });
      return;
    }

    try {
      const attachment = await attachmentsAPI.addAvailableFile(item, {
        methods: ["doi", "url", "oa", "custom"],
      });
      ztoolkit.log("WfhZoteroTools/Lookup: File lookup result", {
        itemID: item.id,
        attachmentID: attachment?.id ?? null,
      });
    } catch (error) {
      ztoolkit.log("WfhZoteroTools/Lookup: addAvailableFile failed", {
        itemID: item.id,
        error,
      });
      Zotero.logError(LookupServerFactory.toError(error));
    }
  }

  static async serializeItem(item: Zotero.Item) {
    const attachmentIDs = item.getAttachments();
    const attachments = await Promise.all(
      attachmentIDs.map(async (attachmentID) => {
        const attachment = await Zotero.Items.getAsync(attachmentID);
        if (!attachment) {
          return null;
        }

        return {
          key: attachment.key,
          title: attachment.getField("title"),
          contentType: attachment.attachmentContentType,
        };
      }),
    );

    return {
      key: item.key,
      libraryID: item.libraryID,
      title: item.getField("title"),
      itemType: Zotero.ItemTypes.getName(item.itemTypeID),
      DOI: item.getField("DOI"),
      attachments: attachments.filter(Boolean),
    };
  }

  static identifierToString(identifier: LookupIdentifier) {
    if (identifier.DOI) return identifier.DOI;
    if (identifier.ISBN) return identifier.ISBN;
    if (identifier.arXiv) return `arXiv:${identifier.arXiv}`;
    if (Array.isArray(identifier.PMID))
      return `PMID:${identifier.PMID.join(",")}`;
    if (identifier.PMID) return `PMID:${identifier.PMID}`;
    if (identifier.adsBibcode) return identifier.adsBibcode;
    return JSON.stringify(identifier);
  }

  static jsonResponse(status: number, body?: Record<string, unknown>) {
    return [
      status,
      "application/json",
      body ? JSON.stringify(body) : undefined,
    ] as const;
  }

  static getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  static toError(error: unknown) {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
}

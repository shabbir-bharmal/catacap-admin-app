const AZURE_BLOB_BASE = "https://catacapstorage.blob.core.windows.net";
export const defaultImage = "/defaultPictureImage.png";
export const catacapDefaultImageLogo = "/catacapLogo.png";

export const getUrlBlobContainerImage = (pictureFileName: string | null | undefined, catacapDefaultImage: boolean = false): string => {
  const container = import.meta.env.VITE_API_IMAGE_CONTAINER || "qacontainer";
  return pictureFileName
    ? `${AZURE_BLOB_BASE}/${container}/${pictureFileName}`
    : catacapDefaultImage ? catacapDefaultImageLogo : defaultImage;
};

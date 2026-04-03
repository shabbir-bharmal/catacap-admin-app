export const defaultImage = "/defaultPictureImage.png";
export const catacapDefaultImageLogo = "/catacapLogo.png";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "";

export const getUrlBlobContainerImage = (pictureFileName: string | null | undefined, catacapDefaultImage: boolean = false): string => {
  if (!pictureFileName) return catacapDefaultImage ? catacapDefaultImageLogo : defaultImage;

  if (pictureFileName.startsWith("http://") || pictureFileName.startsWith("https://")) {
    return pictureFileName;
  }

  if (pictureFileName.startsWith("/")) {
    return pictureFileName;
  }

  if (SUPABASE_URL && SUPABASE_STORAGE_BUCKET && pictureFileName.trim()) {
    return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${pictureFileName}`;
  }

  return catacapDefaultImage ? catacapDefaultImageLogo : defaultImage;
};

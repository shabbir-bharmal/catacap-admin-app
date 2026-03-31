import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";

interface BannerCropperProps {
    image: string;
    aspect: number;
    onCancel: () => void;
    onCropped: (file: File, previewUrl: string) => void;
}

function getCroppedCanvas(
    imgEl: HTMLImageElement,
    crop: Crop
): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    const scaleX = imgEl.naturalWidth / imgEl.width;
    const scaleY = imgEl.naturalHeight / imgEl.height;
    
    let pixelCrop;
    if (crop.unit === "%") {
        pixelCrop = {
            x: (crop.x / 100) * imgEl.naturalWidth,
            y: (crop.y / 100) * imgEl.naturalHeight,
            width: (crop.width / 100) * imgEl.naturalWidth,
            height: (crop.height / 100) * imgEl.naturalHeight,
        };
    } else {
        pixelCrop = {
            x: crop.x * scaleX,
            y: crop.y * scaleY,
            width: crop.width * scaleX,
            height: crop.height * scaleY,
        };
    }

    canvas.width = Math.max(1, pixelCrop.width);
    canvas.height = Math.max(1, pixelCrop.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
        imgEl,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );
    return canvas;
}

export default function BannerCropper({
    image,
    aspect,
    onCancel,
    onCropped,
}: BannerCropperProps) {
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [crop, setCrop] = useState<Crop>();

    const onImageLoad = useCallback(
        (e: React.SyntheticEvent<HTMLImageElement>) => {
            const { width, height } = e.currentTarget;
            const initial = centerCrop(
                makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height),
                width,
                height
            );
            setCrop(initial);
        },
        [aspect]
    );

    const handleSave = useCallback(() => {
        const imgEl = imgRef.current;
        if (!imgEl || !crop) return;
        const canvas = getCroppedCanvas(imgEl, crop);
        canvas.toBlob((blob) => {
            if (!blob) return;
            const file = new File([blob], "cropped.png", { type: "image/png" });
            const previewUrl = URL.createObjectURL(blob);
            onCropped(file, previewUrl);
        }, "image/png");
    }, [crop, onCropped]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 space-y-4">
                <h3 className="text-lg font-semibold">Crop Image</h3>
                <div className="flex justify-center max-h-[60vh] overflow-auto">
                    <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        aspect={aspect}
                    >
                        <img
                            ref={imgRef}
                            src={image}
                            alt="Crop preview"
                            onLoad={onImageLoad}
                            style={{ maxHeight: "55vh" }}
                        />
                    </ReactCrop>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="bg-[#405189] hover:bg-[#364574] text-white"
                    >
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
}

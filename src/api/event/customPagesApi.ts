import axios from "axios";

export interface PublicPage {
    title: string;
    slug: string;
    type: string;
}

interface PublicPagesResponse {
    pages: PublicPage[];
}

const FRONTEND_URL = (import.meta.env.VITE_FRONTEND_URL || "https://qa.catacap.org").replace(/\/+$/, "");

export async function fetchCustomPages(): Promise<PublicPage[]> {
    const response = await axios.get<PublicPagesResponse>(`${FRONTEND_URL}/api/public/pages`, {
        headers: { Accept: "application/json" },
    });
    const pages = response.data?.pages;
    return Array.isArray(pages) ? pages : [];
}

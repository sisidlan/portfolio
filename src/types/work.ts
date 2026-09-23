// ============================================================================
// Shared work-catalogue contracts
// ============================================================================
import type { ImageMetadata } from 'astro';

export type WorkImage = ImageMetadata | string;

export type WorkView = 'list' | 'grid';

export interface WorkThumbnailData {
    sketch?: WorkImage;
    image?: WorkImage;
    alt: string;
}

export interface WorkProject {
    id: string;
    title: string;
    summary: string;
    href: string;
    isVisible: boolean;
    isFeatured: boolean;
    order: number;
    featuredOrder?: number;
    thumbnail: WorkThumbnailData;
}

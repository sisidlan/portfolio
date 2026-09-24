// ============================================================================
// Portfolio project catalogue and display selections
// ============================================================================
import type { WorkProject } from '../types/work';

export const workProjects = [
    {
        id: 'house-of-color',
        title: 'House of Color',
        summary:
            'A fictional pride-focused soda brand with a brand book, soda can design, and promotional poster.',
        href: '/work/house-of-color/',
        isVisible: true,
        isFeatured: true,
        order: 1,
        featuredOrder: 1,
        thumbnail: {
            sketch: '/images/house-of-color-sketch.png',
            image: '/images/house-of-color-image.png',
            alt: '3D soda can mockups of six House of Color flavors.',
        },
    },
    {
        id: 'fly-trapped',
        title: 'Fly Trapped',
        summary:
            'A pixel-art side-scroller inspired by Flappy Bird with handmade visuals, animations, audio, and expanded gameplay mechanics.',
        href: '/work/fly-trapped/',
        isVisible: true,
        isFeatured: true,
        order: 2,
        featuredOrder: 2,
        thumbnail: {
            sketch: '/images/fly-trapped-sketch.png',
            image: '/images/fly-trapped-image.png',
            alt: 'Starting screen of Fly Trapped',
        },
    },
    {
        id: 'klaarhanger',
        title: 'KlaarHanger',
        summary:
            'A dementia-friendly clothing hanger that organizes a complete outfit to make daily dressing easier and more intuitive.',
        href: '/work/klaarhanger/',
        isVisible: true,
        isFeatured: true,
        order: 3,
        featuredOrder: 3,
        thumbnail: {
            sketch: '/images/klaarhanger-sketch.png',
            image: '/images/klaarhanger-image.png',
            alt: 'Illustration of the KlaarHanger hanger design and how to use it',
        },
    },
] satisfies WorkProject[];

function compareOrder(a: WorkProject, b: WorkProject) {
    return a.order - b.order;
}

function compareFeaturedOrder(a: WorkProject, b: WorkProject) {
    return (a.featuredOrder ?? a.order) - (b.featuredOrder ?? b.order);
}

export const visibleWorks = workProjects.filter((work) => work.isVisible).sort(compareOrder);

export const featuredWorks = visibleWorks
    .filter((work) => work.isFeatured)
    .sort(compareFeaturedOrder);

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { shouldReduceMotion } from '../gsap.js';

gsap.registerPlugin(ScrollTrigger);

export function buildIntroTimeline() {
    if (shouldReduceMotion()) {
        gsap.set('header, .hero, .project-section', { opacity: 1 });
        return null;
    }

    gsap.set('header, .hero, .project-section', { opacity: 0 });

    const tl = gsap.timeline();
    tl.to('header', { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0);
    tl.to('.hero', { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.1);
    tl.to('.project-section', { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0.3);

    const discs = document.querySelectorAll('.project-row .project-disc');
    if (discs.length) {
        tl.from(discs, {
            y: 28,
            opacity: 0,
            rotate: -12,
            duration: 0.7,
            stagger: 0.04,
            ease: 'power3.out',
        }, 0.5);
    }
    return tl;
}

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
    return tl;
}

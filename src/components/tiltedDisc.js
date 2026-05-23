// Vanilla-JS port of public/ReactBits/Titled_card.js.
// On pointer move over a disc, compute offset → rotateX/rotateY/scale on an
// inner wrapper. Uses GSAP quickTo for spring-like smoothing.

import { gsap } from 'gsap';

export function attach(discEl, opts = {}) {
    if (!discEl) return () => {};
    const {
        rotateAmplitude = 14,
        scaleOnHover = 1.08,
        shouldSuppress = () => false,
    } = opts;

    const inner = discEl.querySelector(':scope > .disc-tilt-inner');
    if (!inner) return () => {};

    discEl.style.perspective = '800px';
    inner.style.transformStyle = 'preserve-3d';
    inner.style.willChange = 'transform';

    const setRotX = gsap.quickTo(inner, 'rotationX', { duration: 0.4, ease: 'power3' });
    const setRotY = gsap.quickTo(inner, 'rotationY', { duration: 0.4, ease: 'power3' });
    const setScale = gsap.quickTo(inner, 'scale', { duration: 0.3, ease: 'power2.out' });

    let active = false;

    function onEnter() {
        if (shouldSuppress()) return;
        active = true;
        setScale(scaleOnHover);
    }

    function onMove(e) {
        if (!active || shouldSuppress()) return;
        const rect = discEl.getBoundingClientRect();
        const offsetX = e.clientX - rect.left - rect.width / 2;
        const offsetY = e.clientY - rect.top - rect.height / 2;
        const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
        const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;
        setRotX(rotationX);
        setRotY(rotationY);
    }

    function onLeave() {
        active = false;
        setRotX(0);
        setRotY(0);
        setScale(1);
    }

    discEl.addEventListener('pointerenter', onEnter);
    discEl.addEventListener('pointermove', onMove);
    discEl.addEventListener('pointerleave', onLeave);
    discEl.addEventListener('pointercancel', onLeave);

    return function detach() {
        discEl.removeEventListener('pointerenter', onEnter);
        discEl.removeEventListener('pointermove', onMove);
        discEl.removeEventListener('pointerleave', onLeave);
        discEl.removeEventListener('pointercancel', onLeave);
        gsap.killTweensOf(inner);
        inner.style.transform = '';
    };
}

export function shouldEnableEffects() {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.matchMedia('(max-width: 900px)').matches) return false;
    return true;
}

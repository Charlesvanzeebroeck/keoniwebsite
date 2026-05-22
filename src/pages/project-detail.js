import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { buildProjectDetailIntroTimeline } from './project-detail.gsap.js';

// Get project ID from URL parameters
function getProjectIdFromSearch(search) {
    const urlParams = new URLSearchParams(search || window.location.search);
    return urlParams.get('id');
}

import { loadProjects } from '../data.js';

// Load projects data (using centralized loader)
// loadProjects is imported from ../data.js

// Global variables for current project and video state
let currentProject = null;
let currentVideoIndex = 0;
let currentPlayer = null;

// Store event listener references for proper cleanup
let userInteractionHandlers = {
    click: null,
    touchstart: null,
    keydown: null
};

// Ensure current video fully unloads to stop network activity
function teardownCurrentVideo() {
    try {
        if (currentPlayer) {
            try { currentPlayer.pause(); } catch (_) { }
            try { currentPlayer.destroy(); } catch (_) { }
            currentPlayer = null;
        }

        const existingVideo = document.getElementById('projectVideo');
        if (existingVideo) {
            try { existingVideo.pause(); } catch (_) { }
            // Remove sources to abort any ongoing download
            existingVideo.removeAttribute('src');
            const sources = existingVideo.querySelectorAll('source');
            sources.forEach(src => src.remove());
            // Calling load() after removing src ensures network is aborted
            try { existingVideo.load(); } catch (_) { }
        }

        // Clear any previously moved controls
        const customControlsContainer = document.querySelector('.custom-plyr-controls');
        if (customControlsContainer) {
            customControlsContainer.innerHTML = '';
        }
    } catch (_) {
        // no-op
    }
}

// Update project detail with current video
function updateProjectDetail(project, videoIndex = 0) {
    if (!project || !project.videos || project.videos.length === 0) {
        handleProjectNotFound();
        return;
    }

    const video = project.videos[videoIndex];
    console.log('updateProjectDetail called with videoIndex:', videoIndex, 'video:', video);
    if (!video) {
        handleProjectNotFound();
        return;
    }

    // Update page title
    document.title = `${video.title} - ${project.title} - Tate Edits`;

    // Apply format-based CSS class to the entire container
    const projectContainer = document.querySelector('.project-detail-container');
    projectContainer.className = `project-detail-container format-${project.format}`;

    // Teardown the player FIRST before updating video element
    if (currentPlayer) {
        try { currentPlayer.pause(); } catch (_) { }
        try { currentPlayer.destroy(); } catch (_) { }
        currentPlayer = null;
    }

    // Clear any previously moved controls
    const customControlsContainer = document.querySelector('.custom-plyr-controls');
    if (customControlsContainer) {
        customControlsContainer.innerHTML = '';
    }

    // Always recreate the video element to ensure clean state
    const videoContainer = document.querySelector('.project-video-container');
    console.log('Creating new video element for', video.videoUrl);
    videoContainer.innerHTML = `
        <video id="projectVideo" playsinline controls preload="metadata" muted>
            <source src="${video.videoUrl}" type="video/mp4">
            Your browser doesn't support HTML5 video.
        </video>
    `;

    // Update project information
    document.getElementById('projectTitle').textContent = project.title;
    document.getElementById('projectYear').textContent = project.year;
    document.getElementById('projectClient').textContent = project.client;
    document.getElementById('projectDescription').textContent = project.description;
    document.getElementById('projectCategory').textContent = project.category;


    // Update skills
    const skillsContainer = document.getElementById('projectSkills');
    skillsContainer.innerHTML = project.skills.map(skill =>
        `<span class="skill-tag">${skill}</span>`
    ).join('');

    // Update collaborators
    const collaboratorsContainer = document.getElementById('projectCollaborators');
    if (project.collaborators && project.collaborators.length > 0) {
        collaboratorsContainer.innerHTML = project.collaborators.map(collaborator =>
            `<span class="collaborator-tag">${collaborator}</span>`
        ).join('');
    } else {
        collaboratorsContainer.innerHTML = '<p class="no-collaborators">No collaborators</p>';
    }

}

// Initialize Plyr video player
function initializeVideoPlayer() {
    const video = document.getElementById('projectVideo');
    if (video && video.tagName === 'VIDEO') {
        // Destroy existing player if it exists
        if (currentPlayer) {
            try { currentPlayer.pause(); } catch (_) { }
            try { currentPlayer.destroy(); } catch (_) { }
        }

        // Clear the custom controls container before creating new player
        const customControlsContainer = document.querySelector('.custom-plyr-controls');
        if (customControlsContainer) {
            customControlsContainer.innerHTML = '';
        }

        currentPlayer = new Plyr(video, {
            controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
            autoplay: true,
            muted: true,
            tooltips: { controls: true, seek: true },
            settings: [] // Remove settings menu
        });

        // Move controls to custom container after player is ready
        currentPlayer.on('ready', (event) => {
            const instance = event.detail.plyr;
            const controls = instance.elements.controls;

            // Only move controls if they exist and haven't been moved yet
            if (controls && controls.parentElement !== customControlsContainer) {
                customControlsContainer.appendChild(controls);
            }

            // Ensure video is muted and try to autoplay (Safari compatibility)
            const videoElement = instance.media;
            if (videoElement) {
                videoElement.muted = true;
                // Try to play after a short delay to ensure everything is ready
                setTimeout(() => {
                    const playPromise = videoElement.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.log('Autoplay prevented:', error);
                            // Show a play button or indicator that user needs to interact
                        });
                    }
                }, 100);
            }
        });
    }
}

// Handle project not found
function handleProjectNotFound() {
    const container = document.querySelector('.project-detail-container');
    container.innerHTML = `
        <div class="error-container">
            <h2>Project Not Found</h2>
            <p>The project you're looking for doesn't exist.</p>
            <a href="/projects" class="back-link">← Back to Projects</a>
        </div>
    `;
}

// Initialize project detail page
export async function init(_rootEl, { search } = {}) {
    // Hide the mask in case user navigated directly to this page
    const mask = document.querySelector('.mask');
    if (mask) {
        mask.style.display = 'none';
    }

    const projectId = getProjectIdFromSearch(search);

    if (!projectId) {
        handleProjectNotFound();
        return;
    }

    const projects = await loadProjects();
    currentProject = projects.find(project => project.id == projectId);

    if (!currentProject) {
        handleProjectNotFound();
        return;
    }

    // Initialize with first video
    currentVideoIndex = 0;
    updateProjectDetail(currentProject, currentVideoIndex);

    // Initialize video player
    initializeVideoPlayer();

    // Trigger entrance animations after content is fully loaded
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
        setTimeout(() => {
            console.log('About to call buildProjectDetailIntroTimeline');
            buildProjectDetailIntroTimeline();
        }, 100);
    });

    // Add user interaction listener for Safari autoplay
    let hasUserInteracted = false;
    const handleUserInteraction = () => {
        if (!hasUserInteracted && currentPlayer) {
            hasUserInteracted = true;
            const videoElement = currentPlayer.media;
            if (videoElement && videoElement.paused) {
                videoElement.muted = true;
                videoElement.play().catch(error => {
                    console.log('Play failed after user interaction:', error);
                });
            }
        }
    };

    // Store and listen for various user interactions that Safari allows
    userInteractionHandlers.click = handleUserInteraction;
    userInteractionHandlers.touchstart = handleUserInteraction;
    userInteractionHandlers.keydown = handleUserInteraction;
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });
}

export async function destroy() {
    // Teardown video player
    try { teardownCurrentVideo(); } catch (_) { }

    // Remove user interaction listeners
    if (userInteractionHandlers.click) {
        document.removeEventListener('click', userInteractionHandlers.click);
        userInteractionHandlers.click = null;
    }
    if (userInteractionHandlers.touchstart) {
        document.removeEventListener('touchstart', userInteractionHandlers.touchstart);
        userInteractionHandlers.touchstart = null;
    }
    if (userInteractionHandlers.keydown) {
        document.removeEventListener('keydown', userInteractionHandlers.keydown);
        userInteractionHandlers.keydown = null;
    }

    // Reset module state
    currentProject = null;
    currentVideoIndex = 0;
    currentPlayer = null;
}

// Export function to prepare transition to home page
export async function prepareHomeTransition() {
    const { gsap } = await import('gsap');

    // Get the mask element
    const mask = document.querySelector('.mask');
    if (!mask) return;

    // Animate mask down to cover the page before transition
    return new Promise((resolve) => {
        // Skip animation on mobile
        if (window.innerWidth <= 767) {
            resolve();
            return;
        }

        gsap.set(mask, { display: 'block', y: '-100vh' });
        gsap.to(mask, {
            duration: 0.6,
            y: 0,
            ease: "expo.inOut",
            onComplete: resolve
        });
    });
}
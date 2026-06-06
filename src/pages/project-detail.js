import { buildProjectDetailIntroTimeline } from "./project-detail.gsap.js";

// Get project ID from URL parameters
function getProjectIdFromSearch(search) {
  const urlParams = new URLSearchParams(search || window.location.search);
  return urlParams.get("id");
}

import { loadProjects } from "../data.js";
import * as player from "../audioPlayer.js";

function selectVideo(index) {
  if (!currentProject) return;
  if (index === currentVideoIndex) return;
  updateProjectDetail(currentProject, index);
  tryAutoplay();
}

function renderVideoSwitcher(project, activeIndex) {
  const container = document.querySelector(".project-video-switcher");
  if (!container) return;
  const videos = project.videos || [];
  if (videos.length <= 1) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = videos
    .map(
      (v, i) => `
        <button class="video-switcher-btn${i === activeIndex ? " active" : ""}" data-video-index="${i}">
            ${v.title || `Video ${i + 1}`}
        </button>
    `,
    )
    .join("");
  container.querySelectorAll("[data-video-index]").forEach((btn) => {
    btn.addEventListener("click", () =>
      selectVideo(parseInt(btn.dataset.videoIndex, 10)),
    );
  });
}

function renderTrackList(project, activeVideo) {
  const container = document.querySelector(".project-tracklist");
  if (!container) return;
  const tracks = project.tracks || [];
  if (!tracks.length) {
    container.innerHTML = "";
    return;
  }
  const tracksWithMeta = tracks.map((t) => ({ ...t, _project: project }));
  container.innerHTML = tracks
    .map((t, i) => {
      const linkedCount = (t.videoIds || []).length;
      const isActiveForVideo =
        activeVideo && t.cmsId != null && activeVideo.trackId === t.cmsId;
      return `
            <div class="pd-track-row${t.src ? "" : " no-src"}${isActiveForVideo ? " linked-active" : ""}"
                 data-track-index="${i}" role="${t.src ? "button" : "presentation"}" tabindex="${t.src ? "0" : "-1"}">
                <span class="pd-track-num">${i + 1}</span>
                <span class="pd-track-title">${t.title}</span>
                ${linkedCount ? `<span class="pd-track-linked">${linkedCount} video${linkedCount > 1 ? "s" : ""}</span>` : ""}
            </div>
        `;
    })
    .join("");
  container.querySelectorAll(".pd-track-row:not(.no-src)").forEach((row) => {
    const idx = parseInt(row.dataset.trackIndex, 10);
    const handler = () => {
      const track = tracksWithMeta[idx];
      if (track.src) player.playTrack(track, tracksWithMeta);
      // If this track has linked videos, jump to the first one
      const firstLinkedId = (track.videoIds || [])[0];
      if (firstLinkedId) {
        const linkedIdx = (currentProject.videos || []).findIndex(
          (v) => v.id === firstLinkedId,
        );
        if (linkedIdx >= 0) selectVideo(linkedIdx);
      }
    };
    row.addEventListener("click", handler);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") handler();
    });
  });
}

// Load projects data (using centralized loader)
// loadProjects is imported from ../data.js

// Global variables for current project and video state
let currentProject = null;
let currentVideoIndex = 0;

// Store event listener references for proper cleanup
let userInteractionHandlers = {
  click: null,
  touchstart: null,
  keydown: null,
};

function tryAutoplay() {
  const video = document.getElementById("projectVideo");
  if (!video) return;
  video.muted = true;
  const p = video.play();
  if (p) p.catch(() => {});
}

// Ensure current video fully unloads to stop network activity
function teardownCurrentVideo() {
  try {
    const existingVideo = document.getElementById("projectVideo");
    if (existingVideo) {
      try {
        existingVideo.pause();
      } catch (_) {}
      existingVideo.removeAttribute("src");
      existingVideo.querySelectorAll("source").forEach((src) => src.remove());
      try {
        existingVideo.load();
      } catch (_) {}
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
  if (!video) {
    handleProjectNotFound();
    return;
  }
  currentVideoIndex = videoIndex;

  // Update page title
  document.title = `${video.title || project.title} - ${project.title} - Tate Edits`;

  // Apply format-based CSS class (format is per-video now)
  const projectContainer = document.querySelector(".project-detail-container");
  projectContainer.className = `project-detail-container format-${video.format || "h"}`;

  // Teardown previous video before re-rendering
  teardownCurrentVideo();

  // Always recreate the video element to ensure clean state
  const videoContainer = document.querySelector(".project-video-container");
  const videoSrc = video.videoUrl || video.src;
  if (video.resolution && video.resolution.length === 2) {
    videoContainer.style.aspectRatio = `${video.resolution[0]} / ${video.resolution[1]}`;
  }
  videoContainer.innerHTML = `
        <video id="projectVideo" playsinline preload="metadata" muted autoplay loop>
            <source src="${videoSrc}" type="video/mp4">
            Your browser doesn't support HTML5 video.
        </video>
    `;

  renderVideoSwitcher(project, videoIndex);
  renderTrackList(project, video);

  // Update project information
  document.getElementById("projectTitle").textContent = project.title;
  document.getElementById("projectYear").textContent = project.year;
  document.getElementById("projectClient").textContent = project.client;
  document.getElementById("projectDescription").textContent =
    project.description;
  document.getElementById("projectCategory").textContent = project.category;

  // Update skills
  const skillsContainer = document.getElementById("projectSkills");
  skillsContainer.innerHTML = project.skills
    .map((skill) => `<span class="skill-tag">${skill}</span>`)
    .join("");

  // Update collaborators
  const collaboratorsContainer = document.getElementById(
    "projectCollaborators",
  );
  if (project.collaborators && project.collaborators.length > 0) {
    collaboratorsContainer.innerHTML = project.collaborators
      .map(
        (collaborator) =>
          `<span class="collaborator-tag">${collaborator}</span>`,
      )
      .join("");
  } else {
    collaboratorsContainer.innerHTML =
      '<p class="no-collaborators">No collaborators</p>';
  }
}

// Handle project not found
function handleProjectNotFound() {
  const container = document.querySelector(".project-detail-container");
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
  const mask = document.querySelector(".mask");
  if (mask) {
    mask.style.display = "none";
  }

  const projectId = getProjectIdFromSearch(search);

  if (!projectId) {
    handleProjectNotFound();
    return;
  }

  const projects = await loadProjects();
  currentProject = projects.find((project) => project.id == projectId);

  if (!currentProject) {
    handleProjectNotFound();
    return;
  }

  // Initialize with first video
  currentVideoIndex = 0;
  updateProjectDetail(currentProject, currentVideoIndex);
  tryAutoplay();

  requestAnimationFrame(() => {
    setTimeout(() => {
      buildProjectDetailIntroTimeline();
    }, 100);
  });

  // Add user interaction listener for Safari autoplay
  let hasUserInteracted = false;
  const handleUserInteraction = () => {
    if (!hasUserInteracted) {
      hasUserInteracted = true;
      const videoEl = document.getElementById("projectVideo");
      if (videoEl && videoEl.paused) {
        videoEl.muted = true;
        videoEl.play().catch(() => {});
      }
    }
  };

  // Store and listen for various user interactions that Safari allows
  userInteractionHandlers.click = handleUserInteraction;
  userInteractionHandlers.touchstart = handleUserInteraction;
  userInteractionHandlers.keydown = handleUserInteraction;
  document.addEventListener("click", handleUserInteraction, { once: true });
  document.addEventListener("touchstart", handleUserInteraction, {
    once: true,
  });
  document.addEventListener("keydown", handleUserInteraction, { once: true });
}

export async function destroy() {
  // Teardown video player
  try {
    teardownCurrentVideo();
  } catch (_) {}

  // Remove user interaction listeners
  if (userInteractionHandlers.click) {
    document.removeEventListener("click", userInteractionHandlers.click);
    userInteractionHandlers.click = null;
  }
  if (userInteractionHandlers.touchstart) {
    document.removeEventListener(
      "touchstart",
      userInteractionHandlers.touchstart,
    );
    userInteractionHandlers.touchstart = null;
  }
  if (userInteractionHandlers.keydown) {
    document.removeEventListener("keydown", userInteractionHandlers.keydown);
    userInteractionHandlers.keydown = null;
  }

  // Reset module state
  currentProject = null;
  currentVideoIndex = 0;
}

// Export function to prepare transition to home page
export async function prepareHomeTransition() {
  const { gsap } = await import("gsap");

  // Get the mask element
  const mask = document.querySelector(".mask");
  if (!mask) return;

  // Animate mask down to cover the page before transition
  return new Promise((resolve) => {
    // Skip animation on mobile
    if (window.innerWidth <= 767) {
      resolve();
      return;
    }

    gsap.set(mask, { display: "block", y: "-100vh" });
    gsap.to(mask, {
      duration: 0.6,
      y: 0,
      ease: "expo.inOut",
      onComplete: resolve,
    });
  });
}

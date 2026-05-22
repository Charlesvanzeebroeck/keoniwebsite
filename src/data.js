
let projectsCache = null;

export async function loadProjects() {
    if (projectsCache) {
        return projectsCache;
    }

    try {
        const response = await fetch('/projects.json');
        const data = await response.json();
        projectsCache = data.projects;
        return projectsCache;
    } catch (error) {
        console.error('Error loading projects:', error);
        return [];
    }
}

export async function getAllTracks() {
    const projects = await loadProjects();
    const tracks = [];
    for (const project of projects) {
        if (!project.tracks) continue;
        for (const track of project.tracks) {
            if (track.src) {
                tracks.push({ ...track, _project: project });
            }
        }
    }
    return tracks;
}

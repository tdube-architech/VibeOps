import type { AIProvider } from '@main/ai/provider';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import type { ProjectAnalysisInput, ProjectAnalysisResult } from '@shared/ai';

export interface ProjectSummaryDeps {
  provider: AIProvider;
  projectsService: ProjectsService;
  scansRepo: ScansRepo;
}

export async function generateProjectSummary(
  deps: ProjectSummaryDeps,
  args: { projectId: string; signal?: AbortSignal }
): Promise<ProjectAnalysisResult> {
  const project = deps.projectsService.byId(args.projectId);
  if (!project) throw new Error(`project ${args.projectId} not found`);

  const scan = deps.scansRepo.latestForProject(project.id);
  const files = scan ? deps.scansRepo.filesByScan(scan.id) : [];
  const envVars = scan ? deps.scansRepo.envVarsByScan(scan.id) : [];

  const input: ProjectAnalysisInput = {
    project: {
      id: project.id, name: project.name, localPath: project.localPath,
      description: project.description, primaryStack: project.primaryStack
    },
    scanSummary: scan?.summary ?? null,
    detection: {
      projectType: scan?.detection.projectType ?? null,
      frameworks: scan?.detection.frameworks ?? [],
      packageManager: scan?.detection.packageManager ?? null,
      database: scan?.detection.database ?? null,
      auth: scan?.detection.auth ?? null,
      deployment: scan?.detection.deployment ?? null
    },
    topFiles: [...files]
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, 25)
      .map((f) => ({ path: f.path, type: f.fileType, importance: f.importanceScore })),
    envVarNames: envVars.map((v) => v.variable),
    warnings: scan?.warnings ?? []
  };

  const opts: { signal?: AbortSignal } = {};
  if (args.signal) opts.signal = args.signal;
  return deps.provider.analyzeProject(input, opts);
}

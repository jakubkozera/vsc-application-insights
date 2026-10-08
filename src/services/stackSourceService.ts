import * as vscode from 'vscode';

function segments(fileName: string): string[] {
  return fileName.replace(/\\/g, '/').split('/').filter(Boolean);
}

function suffixScore(source: string, candidate: string): number {
  const sourceParts = segments(source);
  const candidateParts = segments(candidate);
  const ignoreCase = /^[a-z]:[\\/]/i.test(source) || source.includes('\\');
  let score = 0;
  while (score < Math.min(sourceParts.length, candidateParts.length)) {
    const sourcePart = sourceParts[sourceParts.length - score - 1];
    const candidatePart = candidateParts[candidateParts.length - score - 1];
    if (ignoreCase ? sourcePart.toLowerCase() !== candidatePart.toLowerCase() : sourcePart !== candidatePart) break;
    score++;
  }
  return score;
}

export async function resolveStackSources(fileNames: string[]): Promise<Map<string, vscode.Uri>> {
  const resolved = new Map<string, vscode.Uri>();
  const folders = vscode.workspace.workspaceFolders ?? [];
  const searches = new Map<string, Promise<vscode.Uri[]>>();
  for (const fileName of new Set(fileNames)) {
    const baseName = segments(fileName).pop();
    if (!baseName || baseName === '.' || baseName === '..') continue;
    const pattern = baseName.replace(/[\[\]*?{}]/g, character => `[${character}]`);
    let search = searches.get(pattern);
    if (!search) {
      search = Promise.all(folders.map(folder =>
        vscode.workspace.findFiles(new vscode.RelativePattern(folder, `**/${pattern}`))
      )).then(matches => matches.flat());
      searches.set(pattern, search);
    }
    const candidates = [...new Map((await search).map(uri => [uri.toString(), uri])).values()];
    const ranked = candidates.map(uri => ({ uri, score: suffixScore(fileName, uri.fsPath) }))
      .filter(candidate => candidate.score > 0)
      .sort((first, second) => second.score - first.score);
    if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
      resolved.set(fileName, ranked[0].uri);
    }
  }
  return resolved;
}

export async function openStackSource(fileName: string, line: number): Promise<void> {
  const uri = (await resolveStackSources([fileName])).get(fileName);
  if (!uri) {
    void vscode.window.showWarningMessage('No unambiguous matching source file was found in the current workspace.');
    return;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  const position = new vscode.Position(Math.max(0, Math.min(line - 1, document.lineCount - 1)), 0);
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One,
    selection: new vscode.Range(position, position),
    preview: true
  });
}
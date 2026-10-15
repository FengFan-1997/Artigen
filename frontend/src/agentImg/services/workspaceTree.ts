import type { WorkspaceFile } from './workspaceFiles';
import type { LocalDirectory, LocalFile } from './localWorkspace';
export type TreeNode = {
  id: string;
  name: string;
  path: string;
  directory: boolean;
  mimeType?: string;
  file?: WorkspaceFile;
  handle?: LocalDirectory | LocalFile;
  children?: TreeNode[];
};
export function cloudTree(files: WorkspaceFile[]): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const file of files) {
    let list = roots;
    const parts = file.path.split('/');
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/');
      if (i === parts.length - 1) {
        list.push({ id: file.id, name, path, directory: false, mimeType: file.mimeType, file });
        return;
      }
      let node = list.find((n) => n.directory && n.path === path);
      if (!node) {
        node = { id: 'directory:' + path, name, path, directory: true, children: [] };
        list.push(node);
      }
      list = node.children!;
    });
  }
  return roots;
}
export async function readLocalDirectory(node: TreeNode): Promise<TreeNode[]> {
  const entries: TreeNode[] = [];
  for await (const handle of (node.handle as LocalDirectory).values()) {
    if (handle.name === '.git') continue;
    entries.push({
      id: 'local:' + node.path + '/' + handle.name,
      path: node.path ? node.path + '/' + handle.name : handle.name,
      name: handle.name,
      directory: handle.kind === 'directory',
      handle: handle as LocalDirectory | LocalFile
    });
    if (entries.length >= 1000) throw new Error('LOCAL_DIRECTORY_TOO_LARGE');
  }
  return entries.sort(
    (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)
  );
}

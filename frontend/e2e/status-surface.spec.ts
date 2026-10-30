import { expect, test } from '@playwright/test';
import { installWorkspaceFixture } from './helpers/workspaceReplicaFixtures';
import { inputRunId } from './helpers/agentInputFixtures';
for (const lang of ['zh','en']) for (const width of [320,390,1440,1920]) test(`file status remains visible and usable ${lang} ${width}`, async ({page}) => {
 const fixture=await installWorkspaceFixture(page, width===320 || width===1440?'light':'dark');
 if(lang==='en') await page.addInitScript(()=>localStorage.setItem('app_lang','en'));
 await page.setViewportSize({width,height:844});await page.goto(`/artigen/agent/runs/${inputRunId}`);await expect(page.locator('.workspace-topbar')).toBeVisible();
 const zh=lang==='zh';const nav=page.getByRole('navigation',{name:zh?'资源面板':'Resources',exact:true});if(!await nav.isVisible())await page.getByRole('button',{name:zh?'打开检查器':'Open inspector',exact:true}).click();await nav.getByRole('button',{name:zh?'文件':'Files',exact:true}).click();const tree=page.getByRole('complementary',{name:zh?'文件目录':'File explorer',exact:true});await tree.getByRole('button',{name:'docs',exact:true}).click();await tree.getByRole('button',{name:'brief.md',exact:true}).click();await page.getByRole('button',{name:zh?'源码':'Source',exact:true}).click();
 const editor=page.getByRole('textbox',{name:zh?'文件编辑器':'File editor',exact:true});await editor.fill('unsaved draft 中文');const footer=page.locator('.file-status');await expect(footer).toContainText(zh?'未保存':'Unsaved');
 const metrics=await footer.evaluate(el=>{const f=el.getBoundingClientRect(),parent=el.parentElement!.getBoundingClientRect();return {left:f.left-parent.left,right:parent.right-f.right,overflow:el.scrollWidth-el.clientWidth,children:[...el.querySelectorAll('button,select')].map(c=>{const b=c.getBoundingClientRect();return {left:b.left-f.left,right:f.right-b.right,height:b.height}})};});
 expect(metrics.left).toBeGreaterThanOrEqual(11);expect(metrics.right).toBeGreaterThanOrEqual(11);expect(metrics.overflow).toBeLessThanOrEqual(1);for(const b of metrics.children){expect(b.left).toBeGreaterThanOrEqual(-1);expect(b.right).toBeGreaterThanOrEqual(-1);if(width<=390)expect(b.height).toBeGreaterThanOrEqual(44)}
 const versions=footer.getByRole('combobox',{name:zh?'查看文件版本':'View file versions'});await versions.focus();await expect(versions).toBeFocused();expect(fixture.workspace.saves).toHaveLength(0);await expect(editor).toContainText('unsaved draft 中文');
});

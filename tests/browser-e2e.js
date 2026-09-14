(async (page) => {
  const root = 'C:/Users/zx304/OneDrive/文件/codex/20260911_suno寫歌';
  const results = {};
  const check=(value,message)=>{if(!value)throw new Error(message);};
  await page.goto('http://127.0.0.1:4317');
  await page.locator('[data-action="new"]').waitFor();
  const second=await page.context().newPage(); await second.goto('http://127.0.0.1:4317');
  await second.getByRole('heading',{name:'歌作已在另一個分頁開啟'}).waitFor(); results.tabLock=true; await second.close();
  await page.locator('[data-action="mode-album"]').click();
  await page.locator('#idea').fill('測試專輯：從深夜下班、回家，到清晨重新出發的三首歌。');
  await page.locator('summary').filter({hasText:'我還有一些想法'}).click();
  await page.locator('#existing-lyrics').fill('[Verse]\n這是我親自寫的歌詞\n[Chorus]\n請保留我的原文');
  await page.locator('[data-action="create-manual"]').click();
  await page.locator('#track-lyrics').waitFor();
  check((await page.locator('#track-lyrics').inputValue()).includes('親自寫'),'完整歌詞未保留');results.fullLyricsPreserved=true;
  check(await page.locator('[data-track]').count()===3,'專輯曲數錯誤');
  await page.locator('[data-action="project-settings"]').click(); await page.locator('#project-title').fill('測試｜回家的三個時刻'); await page.locator('[data-action="save-project-title"]').click();
  const firstId=await page.locator('[data-track]').first().getAttribute('data-track');
  await page.locator('[data-track]').nth(1).click(); await page.locator('#track-title').fill('第二首：回家'); await page.locator('#track-lyrics').fill('[Verse]\n第二首自己的故事');
  await page.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  await page.locator('[data-action="save-version"]').click();
  await page.locator('[data-rewrite="更口語"]').click(); await page.locator('#ai-response').fill('{bad'); await page.locator('[data-action="apply-response"]').click();
  check((await page.locator('#import-error').textContent()).includes('JSON'),'無效 JSON 未顯示錯誤');check(await page.locator('#ai-response').inputValue()==='{bad','匯入錯誤丟失文字');results.invalidImportPreserved=true;
  await page.locator('#ai-response').fill(JSON.stringify({title:'回家',tracks:[{title:'第二首：回家',role:'專輯第二章',style:'warm mandopop, piano',lyrics:'[Verse]\n把鑰匙放在熟悉的地方\n[Chorus]\n家一直在這裡',voice:'溫柔男聲',instrumental:false}]}));
  await page.locator('[data-action="apply-response"]').click();await page.locator('#modal').waitFor({state:'hidden'});
  check((await page.locator('#track-lyrics').inputValue()).includes('家一直在'),'外部 AI 改寫未套用');
  await page.locator(`[data-track="${firstId}"]`).click();check((await page.locator('#track-lyrics').inputValue()).includes('親自寫'),'改寫誤動其他歌曲');results.albumIsolation=true;
  // Exercise the actual browser upload path with a valid one-second PCM WAV.
  await page.locator('[data-tab="audio"]').click();
  await page.locator('#audio-file').setInputFiles(root+'/tests/artifacts/驗證音檔.wav'); await page.locator('audio').waitFor();
  await page.waitForFunction(()=>document.querySelector('audio')?.duration===1);results.audioDuration=await page.locator('audio').evaluate(a=>a.duration);
  await page.locator('#audio-file').setInputFiles(root+'/tests/artifacts/損壞.wav');
  await page.locator('#toast').filter({hasText:'無法播放'}).waitFor();check(await page.locator('.audio-card strong').textContent()==='驗證音檔.wav','無效音檔覆蓋原檔');results.invalidAudioSafe=true;
  await page.locator('[data-tab="cover"]').click();
  await page.locator('#cover-file').setInputFiles(root+'/tests/artifacts/共用背景.png');await page.locator('[data-action="remove-cover"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('#cover-canvas')?.width===1200);
  const before=await page.locator('#cover-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(5,5,1,1).data));
  await page.locator('[data-track]').nth(1).click();await page.waitForFunction(()=>document.querySelector('#cover-canvas')?.width===1200);
  const after=await page.locator('#cover-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(5,5,1,1).data));check(JSON.stringify(before)===JSON.stringify(after),'背景未共用');results.sharedCover=true;
  await page.locator('[data-tab="write"]').click();await page.locator('#track-title').fill('這是一首有著很長很長歌名但仍然應該完整留在封面中央的歌');await page.locator('#save-status').filter({hasText:'已保存'}).waitFor();
  await page.locator('[data-tab="cover"]').click();await page.waitForFunction(()=>document.querySelector('#cover-canvas')?.width===1200);
  await page.screenshot({path:root+'/tests/artifacts/cover-desktop.png',fullPage:true});
  const zipEvent=page.waitForEvent('download');await page.locator('[data-action="export-covers"]').click();const coverZip=await zipEvent;await coverZip.saveAs(root+'/tests/artifacts/covers.zip');results.coverZip=coverZip.suggestedFilename();
  // Save a deliberately unfinished track and version, then restore the complete backup.
  await page.locator('[data-tab="write"]').click();await page.locator('#track-title').fill('');await page.locator('summary').filter({hasText:'曲風提示詞'}).click();await page.locator('#track-style').fill('');await page.locator('[data-action="save-version"]').click();
  const backupEvent=page.waitForEvent('download');await page.locator('[data-action="backup"]').click();const backup=await backupEvent;await backup.saveAs(root+'/tests/artifacts/project.songcraft');
  await page.locator('#backup-file').setInputFiles(root+'/tests/artifacts/project.songcraft');
  await page.getByRole('heading',{name:'測試｜回家的三個時刻（匯入）',exact:true}).waitFor();check(await page.locator('[data-track]').count()===3,'備份曲數錯誤');
  await page.locator('[data-track]').nth(1).click();check(await page.locator('#track-title').inputValue()==='','備份空白草稿未保留');
  await page.locator('[data-action="versions"]').click();check(await page.locator('.version-card').count()===3,'備份版本不完整');await page.locator('[data-action="close-dialog"]').click();
  await page.locator('[data-track]').first().click();await page.locator('[data-tab="audio"]').click();await page.waitForFunction(()=>document.querySelector('audio')?.duration===1);results.backupWithAudioAndVersions=true;
  await page.reload();await page.locator('[data-project]').first().click();await page.locator('[data-tab="audio"]').click();await page.waitForFunction(()=>document.querySelector('audio')?.duration===1);results.audioSurvivesReload=true;
  await page.locator('[data-tab="cover"]').click();await page.locator('[data-action="remove-cover"]').waitFor();results.backgroundSurvivesBackup=true;
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:root+'/tests/artifacts/cover-mobile.png',fullPage:true});results.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);check(!results.mobileOverflow,'手機版橫向溢出');
  await page.setViewportSize({width:1440,height:1000});
  // Exercise client AI plumbing using an intercepted response, never an actual paid API call.
  await page.locator('[data-action="settings"]').click();await page.locator('#api-key').fill('qa-not-a-real-key');await page.locator('[data-action="save-settings"]').click();
  await page.route('**/api/generate',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({title:'測試',concept:'',sharedStyle:'',tracks:[{title:'AI 模擬完成',role:'模擬回覆',lyrics:'[Verse]\n模型介面測試',style:'warm pop',voice:'女聲',instrumental:false}]})}));
  await page.locator('[data-tab="write"]').click();await page.locator('[data-rewrite="更口語"]').click();await page.waitForFunction(()=>document.querySelector('#track-title')?.value==='AI 模擬完成');results.aiClientMock=true;await page.unroute('**/api/generate');
  await page.locator('[data-action="settings"]').click();await page.locator('[data-action="clear-settings"]').click();check(await page.locator('#api-key').count()===0,'金鑰清除後仍留在 DOM');results.keyCleared=true;
  // Remove only QA projects created in this test, leaving any user/sample projects intact.
  for(let i=0;i<2;i++){const item=page.locator('[data-project]').filter({hasText:'測試｜回家的三個時刻'}).first();await item.click();await page.locator('[data-action="project-settings"]').click();await page.locator('[data-action="delete-project"]').click();await page.locator('[data-action="confirm-delete"]').click();}
  return results;
})

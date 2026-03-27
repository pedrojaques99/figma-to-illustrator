/**
 * Figma Plugin Sandbox Side - Improved Stability
 */

figma.showUI(`
  <script>
    window.location.href = "http://localhost:3000";
  </script>
`, { width: 320, height: 480, title: "Visant Exporter" });

// Debounce selection changes slightly to avoid spamming the UI
let selectionTimeout: any = null;

figma.on("selectionchange", async () => {
  if (selectionTimeout) clearTimeout(selectionTimeout);
  
  selectionTimeout = setTimeout(async () => {
    const selection = figma.currentPage.selection;
    const firstFrame = selection.find(node => node.type === 'FRAME') as FrameNode;

    if (firstFrame) {
      try {
        const thumbBytes = await firstFrame.exportAsync({
          format: 'PNG',
          constraint: { type: 'WIDTH', value: 200 }
        });
        
        figma.ui.postMessage({
          type: 'selection-updated',
          hasFrame: true,
          name: firstFrame.name,
          thumbnail: thumbBytes,
          count: selection.filter(n => n.type === 'FRAME').length,
          width: firstFrame.width,
          height: firstFrame.height
        });
      } catch (err) {
        console.error("Thumb export error:", err);
      }
    } else {
      figma.ui.postMessage({
        type: 'selection-updated',
        hasFrame: false
      });
    }
  }, 100); // 100ms debounce
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'request-initial-selection') {
    // Manually trigger the selection update for the new UI instance
    const selection = figma.currentPage.selection;
    const firstFrame = selection.find(node => node.type === 'FRAME') as FrameNode;
    if (firstFrame) {
      const thumbBytes = await firstFrame.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 200 } });
      figma.ui.postMessage({ type: 'selection-updated', hasFrame: true, name: firstFrame.name, thumbnail: thumbBytes, count: selection.filter(n => n.type === 'FRAME').length, width: firstFrame.width, height: firstFrame.height });
    } else {
      figma.ui.postMessage({ type: 'selection-updated', hasFrame: false });
    }
  }

  if (msg.type === 'resize') {
    figma.ui.resize(msg.width || 320, msg.height);
  }

  if (msg.type === 'run-export') {
    const { config } = msg;
    const selection = figma.currentPage.selection;
    const frameSelection = selection.filter(n => n.type === 'FRAME') as FrameNode[];
    
    console.info(`[Architect] Export process started for ${frameSelection.length} frames.`);

    if (frameSelection.length === 0) {
      figma.notify("Selecione pelo menos um frame.");
      return;
    }

    let exportedCount = 0;
    const nameHistory: { [key: string]: number } = {};

    for (const node of frameSelection) {
      let bgClone: SceneNode | null = null;
      let uniqueName = node.name;
      
      try {
        const frameIndex = frameSelection.indexOf(node) + 1;
        const totalFrames = frameSelection.length;
        
        if (nameHistory[uniqueName] !== undefined) {
          nameHistory[uniqueName]++;
          uniqueName = `${node.name} (${nameHistory[uniqueName]})`;
        } else {
          nameHistory[uniqueName] = 0;
        }

        figma.ui.postMessage({ 
          type: 'export-log', 
          message: `[${frameIndex}/${totalFrames}] Iniciando "${uniqueName}"...`, 
          logType: 'info' 
        });

        console.info(`[Architect] Processing "${uniqueName}" (${frameIndex}/${totalFrames})`);
        
        // 1. Clone
        figma.ui.postMessage({ type: 'export-log', message: `> Clonando frame...`, logType: 'info' });
        bgClone = node.clone();
        bgClone.name = `${config.renamePrefix} ${node.name}`;
        
        // Ensure clone is on the same page/parent
        if (node.parent) {
          (node.parent as any).appendChild(bgClone);
        }

        // 2. Isolamento de Background (rasters)
        figma.ui.postMessage({ type: 'export-log', message: `> Ocultando vetores e textos...`, logType: 'info' });
        
        const processNode = (n: SceneNode) => {
          // Tipos que normalmente são vetores ou textos
          const isVectorOrText = 
            n.type === 'TEXT' || 
            n.type === 'VECTOR' || 
            n.type === 'BOOLEAN_OPERATION' || 
            n.type === 'STAR' || 
            n.type === 'LINE' || 
            n.type === 'ELLIPSE' || 
            n.type === 'POLYGON' || 
            n.type === 'RECTANGLE';

          if (isVectorOrText) {
            // Só ocultamos se NÃO for uma imagem (rasters em Figma são geralmente fills de IMAGE)
            const hasImageFill = 'fills' in n && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE');
            if (!hasImageFill) {
              n.opacity = 0;
            }
          }
          
          // Recursão para containers (Frames, Groups, Instances, etc)
          if ('children' in n) {
            for (const child of n.children) {
              processNode(child);
            }
          }
        };
        processNode(bgClone);

        // 3. Export PNG (High-Res 2x-5x)
        const scale = Number(config.pngScale) || 5;
        figma.ui.postMessage({ type: 'export-log', message: `> Exportando PNG Background (${scale}x)...`, logType: 'info' });
        const pngBytes = await bgClone.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: scale }
        });

        // 4. Export SVG (Original ou Clone limpo)
        let svgBytes = null;
        if (config.includeSvg) {
          figma.ui.postMessage({ type: 'export-log', message: `> Exportando SVG Original...`, logType: 'info' });
          svgBytes = await node.exportAsync({ format: 'SVG' });
        }

        figma.ui.postMessage({
          type: 'export-result',
          png: pngBytes,
          svg: svgBytes,
          name: uniqueName,
          folder: uniqueName,
          pngFilename: `${config.renamePrefix} ${uniqueName}.png`,
          svgFilename: `${uniqueName}.svg`
        });

        // 5. Opcional: Extração de imagens individuais
        if (config.separateImages) {
          figma.ui.postMessage({ type: 'export-log', message: `> Extraindo imagens individuais...`, logType: 'info' });
          
          let imageCount = 0;
          const exportSeparateImages = async (n: SceneNode) => {
            const hasImageFill = 'fills' in n && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE');
            
            if (hasImageFill) {
              const imageBytes = await n.exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: scale }
              });
              
              imageCount++;
              figma.ui.postMessage({
                type: 'export-result',
                png: imageBytes,
                name: `image-${imageCount}`, 
                folder: uniqueName,
                pngFilename: `image-${imageCount}.png`
              });
            }

            if ('children' in n) {
              for (const child of n.children) {
                await exportSeparateImages(child);
              }
            }
          };
          await exportSeparateImages(node);
          figma.ui.postMessage({ type: 'export-log', message: `✓ ${imageCount} imagens separadas capturadas.`, logType: 'success' });
        }

        exportedCount++;
        figma.ui.postMessage({ type: 'export-log', message: `✓ "${uniqueName}" pronto.`, logType: 'success' });
        console.info(`[Architect] "${uniqueName}" exported successfully.`);
      } catch (err: any) {
        console.error(`[Architect] Export error for "${uniqueName}":`, err);
        figma.ui.postMessage({ 
          type: 'export-log', 
          message: `✗ Erro em "${uniqueName}": ${err.message || 'Erro desconhecido'}`, 
          logType: 'error' 
        });
        figma.notify(`Erro ao exportar "${uniqueName}"`);
      } finally {
        if (bgClone) {
          try {
            bgClone.remove();
          } catch (e) {
            console.warn("Failed to remove clone:", e);
          }
        }
      }
    }
    
    figma.ui.postMessage({ type: 'export-finished', count: exportedCount });
    
    if (exportedCount > 0) {
      figma.notify(`Sucesso: ${exportedCount} items exportados.`);
      console.info(`[Architect] Export finished. Total items: ${exportedCount}.`);
    } else {
      figma.ui.postMessage({ type: 'export-log', message: "Nenhum frame foi exportado.", logType: 'error' });
    }
  }
};

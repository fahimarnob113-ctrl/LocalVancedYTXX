const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const asar = require('@electron/asar');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const APP_OUT_DIR = path.join(DIST_DIR, 'LocalVancedYT-win32-x64');
const ELECTRON_DIST = path.join(ROOT_DIR, 'node_modules', 'electron', 'dist');

async function main() {
  console.log('=== Building LocalVancedYT Windows Executable ===');

  if (fs.existsSync(APP_OUT_DIR)) {
    console.log('Cleaning existing build...');
    fs.rmSync(APP_OUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(APP_OUT_DIR, { recursive: true });

  console.log('Copying Electron binaries...');
  fs.cpSync(ELECTRON_DIST, APP_OUT_DIR, { recursive: true });

  const originalExe = path.join(APP_OUT_DIR, 'electron.exe');
  const targetExe = path.join(APP_OUT_DIR, 'LocalVancedYT.exe');
  if (fs.existsSync(originalExe)) {
    fs.renameSync(originalExe, targetExe);
    console.log('Renamed binary to LocalVancedYT.exe');
  }

  const defaultAppAsar = path.join(APP_OUT_DIR, 'resources', 'default_app.asar');
  if (fs.existsSync(defaultAppAsar)) {
    fs.unlinkSync(defaultAppAsar);
  }

  console.log('Packing app into app.asar...');
  const tempAppDir = path.join(DIST_DIR, 'temp-app');
  if (fs.existsSync(tempAppDir)) fs.rmSync(tempAppDir, { recursive: true, force: true });
  fs.mkdirSync(tempAppDir, { recursive: true });

  const filesToInclude = [
    'main.js',
    'preload.js',
    'renderer.js',
    'server.js',
    'styles.css',
    'index.html',
    'package.json'
  ];

  for (const file of filesToInclude) {
    fs.copyFileSync(path.join(ROOT_DIR, file), path.join(tempAppDir, file));
  }

  fs.cpSync(path.join(ROOT_DIR, 'assets'), path.join(tempAppDir, 'assets'), { recursive: true });

  const targetAsar = path.join(APP_OUT_DIR, 'resources', 'app.asar');
  await asar.createPackage(tempAppDir, targetAsar);
  fs.rmSync(tempAppDir, { recursive: true, force: true });
  console.log('Created resources/app.asar successfully!');

  const rceditExe = path.join(ROOT_DIR, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
  const iconIco = path.join(ROOT_DIR, 'assets', 'icon.ico');

  if (fs.existsSync(rceditExe) && fs.existsSync(iconIco)) {
    console.log('Setting executable icon and metadata with rcedit...');
    try {
      execSync(`"${rceditExe}" "${targetExe}" --set-icon "${iconIco}" --set-version-string "FileDescription" "LocalVancedYT" --set-version-string "ProductName" "LocalVancedYT" --set-version-string "CompanyName" "LocalVanced" --set-product-version "1.0.0" --set-file-version "1.0.0"`);
      console.log('Icon and metadata applied to LocalVancedYT.exe!');
    } catch (e) {
      console.warn('rcedit note:', e.message);
    }
  }

  console.log('Creating portable distribution ZIP...');
  const zipOutput = path.join(DIST_DIR, 'LocalVancedYT-win32-x64-portable.zip');
  if (fs.existsSync(zipOutput)) fs.unlinkSync(zipOutput);

  try {
    execSync(`powershell -Command "Compress-Archive -Path '${APP_OUT_DIR}\\*' -DestinationPath '${zipOutput}' -CompressionLevel Optimal"`);
    console.log(`Created portable zip: ${zipOutput}`);
  } catch (e) {
    console.warn('Zip creation note:', e.message);
  }

  console.log('=== BUILD FINISHED SUCCESSFULLY! ===');
  console.log('Executable:', targetExe);
  if (fs.existsSync(zipOutput)) console.log('Archive:', zipOutput);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});

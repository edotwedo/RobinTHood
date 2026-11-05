// TestFlight rejects an upload whose CFBundleVersion was already used. app.json still
// says buildNumber "6", and `expo prebuild` writes that 6 into the generated plist as a
// literal. Passing CURRENT_PROJECT_VERSION to xcodebuild does not replace a literal
// CFBundleVersion, so every ios-release upload was build 6.
//
// CI sets ROBIN_IOS_BUILD_NUMBER to the GitHub run number. app.config.js feeds that to
// prebuild, and `node iosBuild.js` stamps the generated project again before archive.
const fs = require('fs');
const path = require('path');

function resolveIosBuildNumber(fromApp, fromCi) {
  const ci = typeof fromCi === 'string' ? fromCi.trim() : '';
  if (!ci) return String(fromApp ?? '').trim();
  if (!/^[1-9]\d*$/.test(ci)) {
    throw new Error(`iOS build number must be a positive integer, got ${ci}`);
  }
  return ci;
}

function stampIosBuildNumber(projectText, buildNumber) {
  const n = resolveIosBuildNumber('', buildNumber);
  const stamped = projectText
    .replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/g, `$1${n}$2`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${n};`);
  return stamped;
}

function stampIosTree(root, buildNumber) {
  const n = resolveIosBuildNumber('', buildNumber);
  let files = 0;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'Pods' || name === 'build') continue;
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.plist') && !name.endsWith('.pbxproj')) continue;
      const before = fs.readFileSync(full, 'utf8');
      const after = stampIosBuildNumber(before, n);
      if (after !== before) {
        fs.writeFileSync(full, after);
        files += 1;
      }
    }
  };
  walk(root);
  return files;
}

module.exports = { resolveIosBuildNumber, stampIosBuildNumber, stampIosTree };

if (require.main === module) {
  const root = path.join(__dirname, 'ios');
  const n = process.env.ROBIN_IOS_BUILD_NUMBER;
  if (!n || !n.trim()) {
    console.error('ROBIN_IOS_BUILD_NUMBER is required');
    process.exit(1);
  }
  const files = stampIosTree(root, n);
  console.log(`Stamped iOS build number ${n.trim()} in ${files} file(s).`);
}

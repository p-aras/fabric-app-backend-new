import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const mode = args[0] ? args[0].toLowerCase() : '';

const helpMessage = `
Usage:
  node search.js <mode> [options]

Modes:
  text, search    Search files recursively for matching query terms.
  file, print     Display content of a file, with optional line range & text filters.
  list            Recursively list files in a directory with their sizes.

Options:
  -q, --query      Comma-separated keywords or query strings.
  -d, --dir        Directory to search or list.
  -f, --file       Target file name or path.
  -e, --ext        File extensions to search (comma-separated, default: .js,.jsx,.html,.css).
  -s, --start      Starting line number (1-based, print mode).
  --end            Ending line number (print mode).
  --limit          Character limit when printing file content from start (print mode).
  -m, --match-only Only print matching filenames, not individual lines (search mode).
`;

if (mode === '-h' || mode === '--help' || !mode) {
  console.log(helpMessage);
  process.exit(0);
}

function parseArgs(argsList) {
  const options = {
    query: '',
    dir: '',
    file: '',
    ext: '.js,.jsx,.html,.css',
    start: 1,
    end: null,
    limit: null,
    matchOnly: false
  };

  for (let i = 0; i < argsList.length; i++) {
    const arg = argsList[i];
    if (arg === '-q' || arg === '--query') {
      options.query = argsList[++i];
    } else if (arg === '-d' || arg === '--dir') {
      options.dir = argsList[++i];
    } else if (arg === '-f' || arg === '--file') {
      options.file = argsList[++i];
    } else if (arg === '-e' || arg === '--ext') {
      options.ext = argsList[++i];
    } else if (arg === '-s' || arg === '--start') {
      options.start = parseInt(argsList[++i], 10);
    } else if (arg === '--end') {
      options.end = parseInt(argsList[++i], 10);
    } else if (arg === '--limit') {
      options.limit = parseInt(argsList[++i], 10);
    } else if (arg === '-m' || arg === '--match-only') {
      options.matchOnly = true;
    }
  }
  return options;
}

const options = parseArgs(args.slice(1));

function locateFile(fileName) {
  if (fs.existsSync(fileName)) return fileName;
  
  const bases = [
    'c:/Users/ay104/OneDrive/Pictures/Desktop/store management design/frontend/src/pages',
    'c:/Users/ay104/OneDrive/Pictures/Desktop/store management design/frontend/src',
    'c:/Users/ay104/OneDrive/Pictures/Desktop/store management design/frontend',
    'c:/Users/ay104/OneDrive/Pictures/Desktop/store management design/backend'
  ];
  for (const base of bases) {
    const full = path.join(base, fileName);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return null;
}

function searchText(options) {
  const queries = options.query ? options.query.split(',').map(q => q.trim().toLowerCase()) : [];
  if (queries.length === 0) {
    console.error('Error: Please specify one or more keywords to search using --query / -q');
    process.exit(1);
  }

  // If a specific file is targeted
  if (options.file) {
    const resolvedPath = locateFile(options.file);
    if (!resolvedPath) {
      console.error(`Error: File "${options.file}" not found.`);
      process.exit(1);
    }
    console.log(`Searching for key terms in: ${resolvedPath}`);
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const l = line.toLowerCase();
      const match = queries.some(q => l.includes(q));
      if (match) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
      }
    });
    return;
  }

  // Search directory recursively
  const searchDir = options.dir || 'c:/Users/ay104/OneDrive/Pictures/Desktop/store management design/frontend';
  if (!fs.existsSync(searchDir)) {
    console.error(`Error: Directory "${searchDir}" does not exist.`);
    process.exit(1);
  }

  const exts = options.ext ? options.ext.split(',').map(e => e.trim().toLowerCase()) : [];
  console.log(`Searching directory recursively: ${searchDir}`);
  console.log(`Query terms: ${queries.join(', ')}`);
  console.log(`Extensions: ${exts.join(', ')}`);

  function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
          walk(fullPath);
        }
      } else {
        const ext = path.extname(file).toLowerCase();
        if (exts.includes(ext)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lContent = content.toLowerCase();
          
          const hasMatch = queries.some(q => lContent.includes(q));
          if (hasMatch) {
            if (options.matchOnly) {
              console.log(`Found in: ${fullPath}`);
            } else {
              const lines = content.split('\n');
              lines.forEach((line, index) => {
                const lLine = line.toLowerCase();
                const matchedQueries = queries.filter(q => lLine.includes(q));
                if (matchedQueries.length > 0) {
                  console.log(`${path.basename(fullPath)} Line ${index + 1}: ${line.trim()}`);
                }
              });
            }
          }
        }
      }
    }
  }

  walk(searchDir);
}

function printFile(options) {
  if (!options.file) {
    console.error('Error: Please specify target file with --file / -f');
    process.exit(1);
  }
  const resolvedPath = locateFile(options.file);
  if (!resolvedPath) {
    console.error(`Error: File "${options.file}" not found.`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  
  if (options.limit && !options.start && !options.end && !options.query) {
    console.log(`Printing first ${options.limit} characters of: ${resolvedPath}`);
    console.log(content.slice(0, options.limit));
    return;
  }

  const lines = content.split('\n');
  const startLine = options.start ? Math.max(1, options.start) : 1;
  const endLine = options.end ? Math.min(lines.length, options.end) : lines.length;

  console.log(`Showing lines ${startLine} to ${endLine} of: ${resolvedPath}`);
  
  const queries = options.query ? options.query.split(',').map(q => q.trim().toLowerCase()) : [];

  for (let idx = startLine - 1; idx < endLine; idx++) {
    const line = lines[idx];
    if (line === undefined) break;

    let showLine = true;
    if (queries.length > 0) {
      showLine = queries.some(q => line.toLowerCase().includes(q));
    }

    if (showLine) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  }
}

function listFiles(options) {
  const listDir = options.dir || 'c:/Users/ay104/OneDrive/Pictures/Desktop/store management design/frontend/src';
  if (!fs.existsSync(listDir)) {
    console.error(`Error: Directory "${listDir}" does not exist.`);
    process.exit(1);
  }

  console.log(`Listing files in directory: ${listDir}`);

  function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
          walk(fullPath);
        }
      } else {
        console.log(`${fullPath} (${stat.size} bytes)`);
      }
    }
  }

  walk(listDir);
}

if (mode === 'text' || mode === 'search') {
  searchText(options);
} else if (mode === 'file' || mode === 'print') {
  printFile(options);
} else if (mode === 'list') {
  listFiles(options);
} else {
  console.log(`Unknown mode: "${mode}"`);
  console.log(helpMessage);
}

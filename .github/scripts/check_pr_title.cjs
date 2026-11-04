const conventionalTitle = /^[a-z][a-z0-9-]*(?:\([a-z0-9._/-]+\))?!?: .+$/;

function isConventionalTitle(title) {
  return conventionalTitle.test(title);
}

if (require.main === module) {
  const title = process.argv[2] ?? '';
  if (!isConventionalTitle(title)) {
    console.error(`PR title must use conventional commit format: type(scope)!: summary. Received: ${title}`);
    process.exitCode = 1;
  } else {
    console.log(`PR title is conventional: ${title}`);
  }
}

module.exports = { isConventionalTitle };

# Publishing Rancha on GitHub (step by step)

One time:
1. Create an empty **private** repository on github.com (private = nobody but you can see the code; no README/license — they already exist here). Copy its address, e.g. `https://github.com/YOUR-NAME/rancha.git`.
2. In the project folder (PowerShell):

       git init
       git add .
       git commit -m "First version of Rancha"
       git branch -M main
       git remote add origin https://github.com/YOUR-NAME/rancha.git
       git push -u origin main

   Make sure `package-lock.json` is committed (it is on your PC after `npm.cmd install`); the automatic build uses it so the same versions are installed every time.
3. On GitHub: **Settings → Actions → General → Workflow permissions →** choose *Read and write permissions* (needed so the build can attach files to the release).

To publish a version:
1. Test the build first: **Actions → Build and release → Run workflow**. When it finishes, download the artifacts and try them.
2. Then tag and push:

       git tag v0.1.0
       git push origin v0.1.0

   The workflow builds Windows and Linux and creates a **Release** with the files.
3. Edit the release text on GitHub and paste `docs/RELEASE_NOTES_v0.1.0.md`.

Before the first public release: confirm where the icon images come from (see THIRD_PARTY_NOTICES.md), and check the name in LICENSE.

## Keeping the code private but letting people download the app
A private repository's Releases can only be seen by people you invite. To let anyone download the program:
1. Create a second, **public** repository (e.g. `rancha-releases`) with only a short README. It holds the downloads, not the code.
2. Create a personal access token: GitHub → Settings → Developer settings → Fine-grained tokens → give it access to *only* `rancha-releases` with **Contents: Read and write**.
3. In the private repository: Settings → Secrets and variables → Actions → add secret `RELEASES_TOKEN` (the token) and variable `RELEASES_REPO` (`YOUR-NAME/rancha-releases`).
The build then runs in the private repository and the finished files appear as a Release in the public one.

Honest note: the downloaded app contains its JavaScript inside the package, and a determined person can unpack and read it. A private repository + license keeps the source out of sight and legally protected, but nothing can make a distributed program impossible to read.

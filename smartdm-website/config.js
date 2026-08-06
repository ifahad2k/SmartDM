/**
 * SmartDM Website Configuration
 * Production configuration for https://github.com/ifahad2k/SmartDM
 */
window.SMARTDM_CONFIG = {
  productName: "SmartDM",
  version: "1.0.0",
  githubOwner: "ifahad2k",
  githubRepo: "https://github.com/ifahad2k/SmartDM",
  defaultBranch: "main",
  license: "GPL-3.0-or-later",
  releaseAssets: {
    windows: {
      filename: "SmartDM-Setup-v1.0.0.exe",
      architecture: "x64",
      minimumOs: "Windows 10"
    },
    appImage: {
      filename: "SmartDM-1.0.0-x86_64.AppImage",
      architecture: "x86_64"
    },
    deb: {
      filename: "smartdm_1.0.0_amd64.deb",
      architecture: "amd64"
    }
  },
  checksums: {
    windows: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    appImage: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    deb: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  links: {
    documentation: "#docs",
    discussions: "https://github.com/ifahad2k/SmartDM/discussions"
  }
};

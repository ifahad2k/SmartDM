/**
 * SmartDM Website Configuration
 * Production configuration for https://github.com/ifahad2k/SmartDM
 */
window.SMARTDM_CONFIG = {
  productName: "SmartDM",
  version: "1.0.2",
  githubOwner: "ifahad2k",
  githubRepo: "https://github.com/ifahad2k/SmartDM",
  defaultBranch: "main",
  license: "GPL-3.0-or-later",
  releaseAssets: {
    windows: {
      filename: "SmartDM-Setup-v1.0.2.exe",
      architecture: "x64",
      minimumOs: "Windows 10"
    },
    appImage: {
      filename: "SmartDM-1.0.2-x86_64.AppImage",
      architecture: "x86_64"
    },
    deb: {
      filename: "smartdm_1.0.2_amd64.deb",
      architecture: "amd64"
    }
  },
  checksums: {
    windows: "160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72",
    appImage: "160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72",
    deb: "160C44F470ED73BA90222E0705AAAA67394ED037C66925D741C6FFF1A1A4DA72"
  },
  links: {
    documentation: "#docs",
    discussions: "https://github.com/ifahad2k/SmartDM/discussions"
  }
};

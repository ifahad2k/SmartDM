const payload = {
  type: 'START_MEDIA_DOWNLOAD',
  url: 'https://www.youtube.com/watch?v=1234567890',
  formatId: '1080p60',
  fileName: 'video.mp4',
  formatsJson: JSON.stringify(Array(20).fill({
    formatId:"308",ext:"webm",resolution:"2560x1440",formatNote:"1440p60",fileSize:2862757060,vcodec:"vp9",acodec:"none",tbr:12007.164,fps:60,isAudioOnly:false,isVideoOnly:true,displayName:"2560x1440 60fps (1440p60) - 2.7 GB",formattedSize:"2.7 GB"
  })),
  cookies: 'A'.repeat(6000)
};
console.log('Size with 20 formats and 6KB cookies:', JSON.stringify(payload).length);

import io.smartdm.media.ytdlp.*;
import io.smartdm.media.api.*;

public class TestExtractor {
    public static void main(String[] args) throws Exception {
        LocalMediaToolManager mgr = new LocalMediaToolManager();
        YtDlpExtractor ext = new YtDlpExtractor(mgr);
        MediaMetadata meta = ext.extractMetadataAsync("https://www.facebook.com/facebook/videos/10153231379946729/", null, null).get();
        if (meta != null) {
            System.out.println("Title: " + meta.title());
            System.out.println("Formats count: " + meta.formats().size());
            for (MediaFormat f : meta.formats()) {
                System.out.println("Format: " + f.formatId() + " Res: " + f.resolution() + " Ext: " + f.ext());
            }
        } else {
            System.out.println("Meta is null");
        }
    }
}

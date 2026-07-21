import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.util.Base64;

public class KeyGen {
    public static void main(String[] args) throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        var kp = kpg.generateKeyPair();
        byte[] pub = kp.getPublic().getEncoded();
        String base64 = Base64.getEncoder().encodeToString(pub);
        
        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        byte[] hash = sha256.digest(pub);
        
        StringBuilder id = new StringBuilder();
        for (int i = 0; i < 16; i++) {
            int b = hash[i] & 0xFF;
            id.append((char) ('a' + ((b >> 4) & 0x0F)));
            id.append((char) ('a' + (b & 0x0F)));
        }
        
        System.out.println("KEY:" + base64);
        System.out.println("ID:" + id.toString());
    }
}

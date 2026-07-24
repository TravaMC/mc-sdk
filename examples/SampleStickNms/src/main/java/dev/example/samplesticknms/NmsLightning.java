package dev.example.samplesticknms;

import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.phys.Vec3;
import org.bukkit.Location;
import org.bukkit.craftbukkit.entity.CraftPlayer;
import org.bukkit.craftbukkit.CraftWorld;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

/**
 * Thin NMS helpers compiled against Mojang mappings via paperweight-userdev.
 * Prefer Paper API when possible — this exists as a learning / last-resort demo.
 */
public final class NmsLightning {

    private NmsLightning() {}

    /**
     * Spawns a cosmetic lightning bolt (no fire / no damage) at {@code loc}
     * and attributes it to the casting player.
     */
    public static void strikeVisual(@NotNull Player bukkitPlayer, @NotNull Location loc) {
        ServerPlayer nmsPlayer = ((CraftPlayer) bukkitPlayer).getHandle();
        ServerLevel level = ((CraftWorld) loc.getWorld()).getHandle();

        LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level);
        if (bolt == null) {
            return;
        }

        bolt.moveTo(new Vec3(loc.getX(), loc.getY(), loc.getZ()));
        bolt.setVisualOnly(true);
        bolt.setCause(nmsPlayer);
        level.addFreshEntity(bolt);

        // Also demonstrate a raw packet send (action bar via NMS Component)
        nmsPlayer.connection.send(
                new ClientboundSetActionBarTextPacket(
                        Component.literal("NMS lightning @ " + loc.getBlockX() + " " + loc.getBlockZ())
                )
        );
    }
}

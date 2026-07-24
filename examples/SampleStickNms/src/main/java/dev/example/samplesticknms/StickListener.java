package dev.example.samplesticknms;

import org.bukkit.FluidCollisionMode;
import org.bukkit.Location;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.util.RayTraceResult;
import org.jetbrains.annotations.NotNull;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

public final class StickListener implements Listener {

    private static final long COOLDOWN_MS = 1500L;
    private static final int RANGE = 48;

    private final StickItems items;

    public StickListener(@NotNull StickItems items) {
        this.items = items;
    }

    @EventHandler(priority = EventPriority.NORMAL)
    public void onInteract(PlayerInteractEvent event) {
        Action action = event.getAction();
        if (action != Action.RIGHT_CLICK_AIR && action != Action.RIGHT_CLICK_BLOCK) {
            return;
        }
        if (event.getHand() != EquipmentSlot.HAND) {
            return;
        }

        ItemStack stack = event.getItem();
        if (stack == null || !items.isStick(stack)) {
            return;
        }

        Player player = event.getPlayer();
        if (!player.hasPermission("sticknms.use")) {
            player.sendMessage(Component.text("No permission.", NamedTextColor.RED));
            return;
        }

        long now = System.currentTimeMillis();
        Long last = player.getPersistentDataContainer().get(items.cooldownKey(), PersistentDataType.LONG);
        if (last != null && now - last < COOLDOWN_MS) {
            return;
        }

        event.setCancelled(true);

        Location target = resolveTarget(player);
        if (target == null) {
            player.sendActionBar(Component.text("No target in range", NamedTextColor.RED));
            return;
        }

        player.getPersistentDataContainer().set(items.cooldownKey(), PersistentDataType.LONG, now);
        NmsLightning.strikeVisual(player, target);
    }

    private static Location resolveTarget(@NotNull Player player) {
        RayTraceResult hit = player.getWorld().rayTraceBlocks(
                player.getEyeLocation(),
                player.getEyeLocation().getDirection(),
                RANGE,
                FluidCollisionMode.NEVER,
                true
        );
        if (hit != null && hit.getHitBlock() != null) {
            Block block = hit.getHitBlock();
            return block.getLocation().add(0.5, 1.0, 0.5);
        }
        // Fallback: a bit in front of the player
        return player.getEyeLocation().add(player.getLocation().getDirection().multiply(8));
    }
}

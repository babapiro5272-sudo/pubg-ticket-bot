require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType,
  SlashCommandBuilder
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const Database = require('better-sqlite3');

const db = new Database('database.sqlite');

// Veritabanı Tabloları
db.prepare(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    panel_channel_id TEXT,
    log_channel_id TEXT,
    role_1 TEXT,
    role_2 TEXT,
    role_3 TEXT,
    thumbnail_url TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS tickets (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT,
    user_id TEXT,
    category TEXT,
    status TEXT,
    created_at INTEGER
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT,
    guild_id TEXT,
    user_id TEXT,
    score INTEGER,
    comment TEXT,
    timestamp INTEGER
  )
`).run();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Slash Komutlarını Kaydetme
client.once('ready', async () => {
  console.log(`[PUBG ESPORTS v3.0] ${client.user.tag} başarıyla aktifleştirildi.`);

  const commands = [
    new SlashCommandBuilder()
      .setName('ticket_ayar')
      .setDescription('PUBG Espor Destek Panelini kurar ve sunucu yetkililerini belirler.')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addChannelOption(opt =>
        opt.setName('kanal')
          .setDescription('Panelin gönderileceği metin kanalı')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addRoleOption(opt =>
        opt.setName('rol_1')
          .setDescription('1. Yetkili / Hakem Rolü (Örn: Baş Hakem)')
          .setRequired(true)
      )
      .addRoleOption(opt =>
        opt.setName('rol_2')
          .setDescription('2. Yetkili Rolü (Örn: Scrim Yöneticisi)')
          .setRequired(false)
      )
      .addRoleOption(opt =>
        opt.setName('rol_3')
          .setDescription('3. Yetkili Rolü (Örn: Akademi Sorumlusu)')
          .setRequired(false)
      )
      .addStringOption(opt =>
        opt.setName('simge')
          .setDescription('Embed panelinde ve biletlerde sağ üstte çıkacak logo/resim URL adresi')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('ticket_log')
      .setDescription('Bilet arşivi, HTML transkript ve değerlendirme log kanalını ayarlar.')
      .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
      .addChannelOption(opt =>
        opt.setName('kanal')
          .setDescription('Log kayıt kanalı')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  ];

  await client.application.commands.set(commands);
  console.log('[KOMUTLAR] Global slash komutları kaydedildi.');
});

// Etkileşim Yöneticisi
client.on('interactionCreate', async (interaction) => {
  // 1. /ticket_ayar KOMUTU
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticket_ayar') {
    await interaction.deferReply({ ephemeral: true });

    const panelChannel = interaction.options.getChannel('kanal');
    const role1 = interaction.options.getRole('rol_1');
    const role2 = interaction.options.getRole('rol_2');
    const role3 = interaction.options.getRole('rol_3');
    const simge = interaction.options.getString('simge') || client.user.displayAvatarURL();

    db.prepare(`
      INSERT INTO guild_settings (guild_id, panel_channel_id, role_1, role_2, role_3, thumbnail_url)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        panel_channel_id = excluded.panel_channel_id,
        role_1 = excluded.role_1,
        role_2 = excluded.role_2,
        role_3 = excluded.role_3,
        thumbnail_url = excluded.thumbnail_url
    `).run(
      interaction.guild.id,
      panelChannel.id,
      role1.id,
      role2 ? role2.id : null,
      role3 ? role3.id : null,
      simge
    );

    const panelEmbed = new EmbedBuilder()
      .setColor('#ff2d55')
      .setAuthor({ name: 'Destek Sistemi', iconURL: simge })
      .setThumbnail(simge)
      .setDescription(
        `Merhaba! Destek sistemine hoş geldin.\n` +
        `Lütfen aşağıdan uygun kategori seç.\n\n` +
        `📜 **Talimatlar**\n` +
        `Aşağıdaki listeden ihtiyacına uygun kategoriyi seç.\n\n` +
        `🎟️ **Bilet Kuralları**\n` +
        `• Bilette spesifik birine tag atmak yasaktır.\n` +
        `• Bilette toplu tag atmak yasaktır.\n` +
        `• Sunucu kurallarının hepsi bilette geçerlidir.\n\n` +
        `Bilette sizinle ilgilenen kişi yazmadan önce direkt olarak sorununuzu yazarsanız daha hızlı çözüme ulaşırsınız. ` +
        `Yukarıdaki kurallara uymayan kişilere cezai yaptırım uygulanacaktır.\n\n` +
        `🚩 **Genel Destek**\n` +
        `> Akademi başvuruları, rank/rol onayı ve genel konular için açılması gereken bilet.\n\n` +
        `🚩 **Şikayet Destek**\n` +
        `> Hile, kural ihlali ve oyuncu şikayetleri için açılması gereken destek bileti.`
      )
      .setFooter({ text: 'Bunu sadece sen görebilirsin • Destek Sistemi' });

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('📁 Destek Kategorisi Seç')
        .addOptions([
          {
            label: 'Genel Destek',
            value: 'genel_destek',
            description: 'Akademi süreçleri, rol/rank onayları ve genel sorular',
            emoji: '🚩'
          },
          {
            label: 'Şikayet Destek',
            value: 'sikayet_destek',
            description: 'Kural ihlalleri, hile şüphesi ve şikayet bildirimleri',
            emoji: '🚩'
          }
        ])
    );

    await panelChannel.send({ embeds: [panelEmbed], components: [menu] });
    await interaction.editReply({ content: `✅ PUBG Espor Destek Paneli <#${panelChannel.id}> kanalına başarıyla kuruldu.` });
  }

  // 2. /ticket_log KOMUTU
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticket_log') {
    const logChannel = interaction.options.getChannel('kanal');

    db.prepare(`
      INSERT INTO guild_settings (guild_id, log_channel_id)
      VALUES (?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        log_channel_id = excluded.log_channel_id
    `).run(interaction.guild.id, logChannel.id);

    await interaction.reply({ content: `✅ Ticket log kanalı <#${logChannel.id}> olarak kaydedildi.`, ephemeral: true });
  }

  // 3. KATEGORİ SEÇİMİ -> MODAL FORMU
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
    const val = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`modal_create_${val}`)
      .setTitle(val === 'genel_destek' ? 'Genel Destek Formu' : 'Şikayet Destek Formu');

    const inputPubgId = new TextInputBuilder()
      .setCustomId('pubg_id')
      .setLabel('PUBG Oyun İçi Nick ve ID:')
      .setPlaceholder('Örn: 5123456789 (ProSniper)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const inputDetails = new TextInputBuilder()
      .setCustomId('pubg_details')
      .setLabel('Sorununuz / Talebiniz / Açıklamanız:')
      .setPlaceholder('Lütfen durumunuzu detaylı bir şekilde açıklayınız...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(inputPubgId),
      new ActionRowBuilder().addComponents(inputDetails)
    );

    await interaction.showModal(modal);
  }

  // 4. MODAL GÖNDERİMİ -> BİLET KANALINI OLUŞTURMA
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_create_')) {
    await interaction.deferReply({ ephemeral: true });

    const categoryKey = interaction.customId.replace('modal_create_', '');
    const settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(interaction.guild.id);

    if (!settings) {
      return interaction.editReply({ content: '❌ Sunucuda ticket ayarları henüz yapılmamış.' });
    }

    const pubgId = interaction.fields.getTextInputValue('pubg_id');
    const pubgDetails = interaction.fields.getTextInputValue('pubg_details');
    const categoryName = categoryKey === 'genel_destek' ? 'Genel Destek' : 'Şikayet Destek';

    const cleanUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
    const channelName = `bilet-${cleanUsername}`;

    // Kanal İzinleri
    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.EmbedLinks
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages
        ]
      }
    ];

    const roles = [settings.role_1, settings.role_2, settings.role_3].filter(Boolean);
    roles.forEach(roleId => {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    });

    const ticketChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: `Bilet Sahibi: ${interaction.user.tag} (${interaction.user.id}) | Kategori: ${categoryName} | PUBG ID: ${pubgId}`,
      permissionOverwrites: permissionOverwrites
    });

    db.prepare(`
      INSERT INTO tickets (channel_id, guild_id, user_id, category, status, created_at)
      VALUES (?, ?, ?, ?, 'OPEN', ?)
    `).run(ticketChannel.id, interaction.guild.id, interaction.user.id, categoryName, Date.now());

    const thumb = settings.thumbnail_url || client.user.displayAvatarURL();

    // Bilet Karşılama Embed'i
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#ff2d55')
      .setAuthor({ name: 'Destek Sistemi', iconURL: thumb })
      .setThumbnail(thumb)
      .setDescription(
        `Merhaba <@${interaction.user.id}>, yaşadığınız sorunu buradan belirtebilirsiniz.\n\n` +
        `🎮 **PUBG ID / Nick:** \`${pubgId}\`\n` +
        `📝 **Açıklama:** *${pubgDetails}*\n\n` +
        `🎟️ **Bilet Kuralları**\n` +
        `• Bilette spesifik birine tag atmak yasaktır.\n` +
        `• Bilette toplu tag atmak yasaktır.\n` +
        `• Sunucu kurallarının hepsi bilette geçerlidir.\n\n` +
        `Bilette sizinle ilgilenen kişi yazmadan önce direkt olarak sorununuzu yazarsanız daha hızlı çözüme ulaşırsınız. ` +
        `Yukarıdaki kurallara uymayan kişilere cezai yaptırım uygulanacaktır.`
      );

    // SADECE "BİLETİ KAPAT" İÇEREN MENÜ
    const actionMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_action_select')
        .setPlaceholder('Bir işlem seçin')
        .addOptions([
          {
            label: 'Bileti Kapat',
            value: 'action_close',
            emoji: '🔒',
            description: 'Bileti kapatır ve sonlandırır.'
          }
        ])
    );

    const roleTags = roles.map(r => `<@&${r}>`).join(', ');
    await ticketChannel.send({
      content: `${roleTags} • <@${interaction.user.id}>\n\n# #${channelName} kanalına hoş geldin!\n` +
               `Bu, özel **#${channelName}** kanalının doğuşu.\n` +
               `🎫 **Bilet Sahibi:** <@${interaction.user.id}> (${interaction.user.id})\n` +
               `📁 **Kategori:** ${categoryName}\n` +
               `🌐 **Dil:** Türkçe (tr)\n` +
               `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      embeds: [welcomeEmbed],
      components: [actionMenu]
    });

    await interaction.editReply({ content: `✅ Biletiniz oluşturuldu: <#${ticketChannel.id}>` });
  }

  // 5. BİLETİ KAPATMA AKSİYONU
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_action_select') {
    const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(interaction.channel.id);
    if (!ticket) {
      return interaction.reply({ content: 'Bu kanal aktif bir bilet değil.', ephemeral: true });
    }

    if (interaction.values[0] === 'action_close') {
      const settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(interaction.guild.id);
      const isOwner = interaction.user.id === ticket.user_id;

      // 1. Kanalı Kapat / İsim Değiştir
      const closedChannelName = `kapatıldı-${interaction.channel.name.replace('bilet-', '')}`;
      await interaction.channel.setName(closedChannelName).catch(() => {});

      // 2. Kullanıcının yazma yetkisini kaldır
      await interaction.channel.permissionOverwrites.edit(ticket.user_id, {
        SendMessages: false,
        ViewChannel: true
      }).catch(() => {});

      db.prepare('UPDATE tickets SET status = "CLOSED" WHERE channel_id = ?').run(interaction.channel.id);

      // 3. HTML Transkript Oluştur ve Log Kanalına Gönder
      const transcriptAttachment = await discordTranscripts.createTranscript(interaction.channel, {
        limit: -1,
        returnType: 'attachment',
        fileName: `${interaction.channel.name}-transkript.html`,
        minify: true,
        saveImages: true
      });

      const thumb = (settings && settings.thumbnail_url) ? settings.thumbnail_url : client.user.displayAvatarURL();

      if (settings && settings.log_channel_id) {
        const logChannel = interaction.guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setAuthor({ name: 'PUBG ESPOR • BİLET ARŞİVİ', iconURL: thumb })
            .setTitle('📁 Bilet Kapatıldı & Arşivlendi')
            .addFields(
              { name: '🎫 Kanal', value: `#${closedChannelName}`, inline: true },
              { name: '👤 Bilet Sahibi', value: `<@${ticket.user_id}>`, inline: true },
              { name: '🔒 Kapatan Yetkili/Kişi', value: `<@${interaction.user.id}>`, inline: true },
              { name: '📁 Kategori', value: ticket.category, inline: true }
            )
            .setFooter({ text: 'HTML transkript sohbet dökümü ekte yer almaktadır.' })
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed], files: [transcriptAttachment] });
        }
      }

      // 4. Kullanıcıya DM Gönder (Bileti Yeniden Aç ve Puanlama Paneli)
      try {
        const ticketOwner = await client.users.fetch(ticket.user_id);

        const dmCloseEmbed = new EmbedBuilder()
          .setColor('#ff2d55')
          .setAuthor({ name: 'Destek Sistemi', iconURL: thumb })
          .setThumbnail(thumb)
          .setDescription(
            `Biletiniz kapatıldı:\n**#${closedChannelName}**\n\n` +
            `Kanal hâlâ duruyorsa aşağıdaki butona basarak yeniden açabilirsiniz.`
          );

        const dmCloseRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`reopen_${interaction.channel.id}_${interaction.guild.id}`)
            .setLabel('Bileti Yeniden Aç')
            .setStyle(ButtonStyle.Primary)
        );

        const dmRatingEmbed = new EmbedBuilder()
          .setColor('#ffd60a')
          .setAuthor({ name: 'Destek Sistemi', iconURL: thumb })
          .setThumbnail(thumb)
          .setTitle('Yetkili Değerlendirme Paneli')
          .setDescription(
            `Bu bilette sizinle ilgilenen yetkiliyi olumlu veya olumsuz şekilde anonim olarak değerlendirebilirsiniz.`
          );

        const dmRatingRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`rate_pos_${interaction.channel.id}_${interaction.guild.id}`)
            .setLabel('Olumlu Değerlendir')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`rate_neg_${interaction.channel.id}_${interaction.guild.id}`)
            .setLabel('Olumsuz Değerlendir')
            .setStyle(ButtonStyle.Danger)
        );

        await ticketOwner.send({
          embeds: [dmCloseEmbed, dmRatingEmbed],
          components: [dmCloseRow, dmRatingRow]
        });
      } catch (err) {
        console.log('Kullanıcı DM kapalı.');
      }

      await interaction.channel.send({ content: `🔒 Bu bilet <@${interaction.user.id}> tarafından kapatıldı.` });

      // 5. İŞLEMİ YAPAN KİŞİYE ÖZEL EPHEMERAL MENÜ
      const closedMenuOptions = [
        {
          label: 'Bileti Yeniden Aç',
          value: 'action_reopen',
          emoji: '🔓',
          description: 'Bileti tekrar aktif eder ve yazma yetkisini geri verir.'
        }
      ];

      // Eğer yetkili kapattıysa silme seçeneği de eklenir
      if (!isOwner) {
        closedMenuOptions.push({
          label: 'Bileti Sil',
          value: 'action_delete',
          emoji: '🗑️',
          description: 'Bilet kanalını tamamen sunucudan siler.'
        });
      }

      const closedMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_closed_menu')
          .setPlaceholder('Bir işlem seçin')
          .addOptions(closedMenuOptions)
      );

      await interaction.reply({
        content: `🔒 Bilet kapatıldı. Yapmak istediğiniz işlemi seçin:`,
        components: [closedMenu],
        ephemeral: true
      });
    }
  }

  // 6. EPHEMERAL MENÜ İŞLEMLERİ (YENİDEN AÇ / SİL)
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_closed_menu') {
    const selected = interaction.values[0];
    const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: 'Bilet kaydı bulunamadı.', ephemeral: true });
    }

    // YENİDEN AÇ
    if (selected === 'action_reopen') {
      const restoredName = `bilet-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      await interaction.channel.setName(restoredName).catch(() => {});

      await interaction.channel.permissionOverwrites.edit(ticket.user_id, {
        SendMessages: true,
        ViewChannel: true
      }).catch(() => {});

      db.prepare('UPDATE tickets SET status = "OPEN" WHERE channel_id = ?').run(interaction.channel.id);

      await interaction.channel.send({ content: `🔓 Bilet <@${interaction.user.id}> tarafından yeniden açıldı.` });
      await interaction.update({ content: '✅ Bilet başarıyla yeniden açıldı.', components: [] });
    }

    // SİL
    if (selected === 'action_delete') {
      await interaction.update({ content: '🗑️ Bilet 5 saniye içerisinde tamamen siliniyor...', components: [] });
      await interaction.channel.send({ content: '🗑️ Bilet siliniyor...' });

      setTimeout(async () => {
        await interaction.channel.delete().catch(() => {});
      }, 5000);
    }
  }

   // 7. DM: BİLETİ YENİDEN AÇ BUTONU
  if (interaction.isButton() && interaction.customId.startsWith('reopen_')) {
    const [, channelId, guildId] = interaction.customId.split('_');
    const guild = client.guilds.cache.get(guildId);

    if (!guild) return interaction.reply({ content: 'Sunucu bulunamadı.', ephemeral: true });

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return interaction.reply({ content: '❌ Bu destek kanalı sunucudan tamamen silinmiş.', ephemeral: true });

    const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
    if (!ticket) return interaction.reply({ content: 'Bilet kaydı bulunamadı.', ephemeral: true });

    const restoredName = `bilet-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    await channel.setName(restoredName).catch(() => {});

    await channel.permissionOverwrites.edit(interaction.user.id, {
      SendMessages: true,
      ViewChannel: true
    }).catch(() => {});

    db.prepare('UPDATE tickets SET status = "OPEN" WHERE channel_id = ?').run(channelId);

    await channel.send({ content: `🔓 Bilet, sahibi <@${interaction.user.id}> tarafından DM üzerinden tekrar aktif edildi.` });
    await interaction.reply({ content: `✅ Biletiniz tekrar açıldı: <#${channel.id}>`, ephemeral: true });
  }

  // 8. DM: DEĞERLENDİRME BUTONU -> MODAL
  if (interaction.isButton() && (interaction.customId.startsWith('rate_pos_') || interaction.customId.startsWith('rate_neg_'))) {
    const parts = interaction.customId.split('_');
    const type = parts[1];
    const channelId = parts[2];
    const guildId = parts[3];

    const modal = new ModalBuilder()
      .setCustomId(`modal_rating_${type}_${channelId}_${guildId}`)
      .setTitle(type === 'pos' ? 'Olumlu Değerlendirme' : 'Olumsuz Değerlendirme');

    const commentInput = new TextInputBuilder()
      .setCustomId('rating_comment')
      .setLabel('Geri bildiriminiz veya yorumunuz:')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Hizmet kalitesi hakkında eklemek istedikleriniz...')
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
    await interaction.showModal(modal);
  }

  // 9. DEĞERLENDİRME KAYDI & LOG
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_rating_')) {
    const [, , type, channelId, guildId] = interaction.customId.split('_');
    const comment = interaction.fields.getTextInputValue('rating_comment') || 'Görüş belirtilmedi.';
    const score = type === 'pos' ? 5 : 1;
    const ratingLabel = type === 'pos' ? 'Olumlu (5★)' : 'Olumsuz (1★)';

    db.prepare(`
      INSERT INTO ratings (ticket_id, guild_id, user_id, score, comment, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(channelId, guildId, interaction.user.id, score, comment, Date.now());

    const settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
    if (settings && settings.log_channel_id) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const logChannel = guild.channels.cache.get(settings.log_channel_id);
        if (logChannel) {
          const evalEmbed = new EmbedBuilder()
            .setColor(type === 'pos' ? '#2ecc71' : '#e74c3c')
            .setAuthor({ name: '⭐ YETKİLİ DEĞERLENDİRMESİ', iconURL: settings.thumbnail_url || client.user.displayAvatarURL() })
            .addFields(
              { name: '👤 Kullanıcı', value: `<@${interaction.user.id}> (Anonim)`, inline: true },
              { name: '📊 Sonuç', value: ratingLabel, inline: true },
              { name: '💬 Yorum', value: `\`\`\`${comment}\`\`\`` }
            )
            .setTimestamp();
          await logChannel.send({ embeds: [evalEmbed] });
        }
      }
    }

    await interaction.reply({ content: '✅ Değerlendirmeniz anonim olarak kaydedildi. Teşekkür ederiz!', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
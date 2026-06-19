const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mensaje')
        .setDescription('Enviar un mensaje con embed como TSDE BOT [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(opt =>
            opt.setName('canal')
                .setDescription('Canal donde enviar el mensaje')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        ),

    async execute(interaction, client) {
        const canal = interaction.options.getChannel('canal');

        // Guardamos el canal elegido en el customId del modal para recuperarlo luego
        const modal = new ModalBuilder()
            .setCustomId(`msg_modal_${canal.id}`)
            .setTitle('Enviar mensaje');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('titulo')
                    .setLabel('Título')
                    .setPlaceholder('Ej: 📢 Anuncio importante')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('descripcion')
                    .setLabel('Contenido del mensaje')
                    .setPlaceholder('Escribe aquí el mensaje completo...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('color')
                    .setLabel('Color en hexadecimal (opcional)')
                    .setPlaceholder('Ej: E74C3C para rojo, 2ECC71 para verde...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('imagen')
                    .setLabel('URL de imagen (opcional)')
                    .setPlaceholder('https://...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('mencion')
                    .setLabel('Mencionar (opcional: everyone / here / no)')
                    .setPlaceholder('everyone, here, o deja vacío')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            )
        );

        await interaction.showModal(modal);
    },

    async handleModal(interaction, client) {
        const { EmbedBuilder, MessageFlags } = require('discord.js');

        const canalId = interaction.customId.replace('msg_modal_', '');
        const titulo = interaction.fields.getTextInputValue('titulo');
        const descripcion = interaction.fields.getTextInputValue('descripcion');
        const colorRaw = interaction.fields.getTextInputValue('color').trim().replace('#', '');
        const imagen = interaction.fields.getTextInputValue('imagen').trim();
        const mencionRaw = interaction.fields.getTextInputValue('mencion').trim().toLowerCase();

        let color = 0x9B59B6;
        if (colorRaw && /^[0-9A-Fa-f]{6}$/.test(colorRaw)) {
            color = parseInt(colorRaw, 16);
        }

        const embed = new EmbedBuilder()
            .setTitle(titulo)
            .setDescription(descripcion)
            .setColor(color)
            .setFooter({ text: `Publicado por ${interaction.user.username}` })
            .setTimestamp();

        if (imagen && imagen.startsWith('http')) {
            embed.setImage(imagen);
        }

        let contenidoExtra = '';
        if (mencionRaw === 'everyone') contenidoExtra = '@everyone';
        if (mencionRaw === 'here') contenidoExtra = '@here';

        try {
            const canal = await client.channels.fetch(canalId);
            await canal.send({
                content: contenidoExtra || undefined,
                embeds: [embed],
                allowedMentions: { parse: ['everyone'] }
            });

            await interaction.reply({
                content: `✅ Mensaje enviado a <#${canalId}>`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            await interaction.reply({
                content: `❌ Error enviando el mensaje: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

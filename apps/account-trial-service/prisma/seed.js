import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Dữ liệu seed tối thiểu để claim trial có campaign tham chiếu.
// upsert = chạy lại nhiều lần vẫn không lỗi trùng khóa.
const campaigns = [
  {
    campaignId: 'PREMIUM_7_DAYS',
    name: 'Premium 7 Days Trial',
    durationDays: 7,
    active: true,
  },
];

async function main() {
  for (const campaign of campaigns) {
    const saved = await prisma.trialCampaign.upsert({
      where: { campaignId: campaign.campaignId },
      update: {
        name: campaign.name,
        durationDays: campaign.durationDays,
        active: campaign.active,
      },
      create: campaign,
    });

    console.log(
      `[seed] campaign ${saved.campaignId}: ${saved.name} (${saved.durationDays} ngày, active=${saved.active})`,
    );
  }
}

main()
  .catch((error) => {
    console.error('[seed] thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

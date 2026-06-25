module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method không được hỗ trợ' });
    }

    try {
        const payload = req.body;
        const eventType = payload.type;

        // Chỉ xử lý khi có session mới được tạo
        if (eventType === 'session.created') {
            const sessionData = payload.data;
            const userId = sessionData?.user_id;

            if (!userId) {
                console.warn("⚠️ Không tìm thấy user_id trong webhook");
                return res.status(200).json({ success: true });
            }

            const secretKey = process.env.CLERK_SECRET_KEY;
            if (!secretKey) {
                console.error("❌ Thiếu CLERK_SECRET_KEY");
                return res.status(500).json({ error: "Chưa cấu hình Secret Key" });
            }

            console.log(`🔄 [Webhook] User ${userId} vừa tạo session mới.`);

            // Lấy tất cả session active của user
            const response = await fetch(
                `https://api.clerk.com/v1/sessions?user_id=${userId}&status=active`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${secretKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                console.error(`Lỗi lấy sessions: ${response.status}`);
                return res.status(200).json({ success: true });
            }

            const data = await response.json();
            let sessions = data.data || [];

            // Sắp xếp theo thời gian tạo (cũ nhất trước)
            sessions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // Giữ lại 2 session mới nhất, revoke những cái cũ hơn
            if (sessions.length > 2) {
                const sessionsToRevoke = sessions.slice(0, sessions.length - 2);

                for (const session of sessionsToRevoke) {
                    await fetch(`https://api.clerk.com/v1/sessions/${session.id}/revoke`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${secretKey}`,
                            'Content-Type': 'application/json',
                        },
                    });
                    console.log(`🚫 Đã revoke session cũ: ${session.id} của user ${userId}`);
                }
            } else {
                console.log(`✅ User ${userId} có ${sessions.length} session. Cho phép.`);
            }
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('❌ Lỗi Webhook:', error.message);
        return res.status(200).json({ success: true }); // Luôn trả 200
    }
};
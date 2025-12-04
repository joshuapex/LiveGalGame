-- LiveGalGame 示例数据初始化脚本

-- 插入角色数据
INSERT OR IGNORE INTO characters (id, name, nickname, relationship_label, avatar_color, affinity, created_at, updated_at, notes) VALUES
('miyu', 'Miyu', '小咪', '青梅竹马', '#ff6b6b', 75, 1735689600000, 1735689600000, '活泼可爱的青梅竹马，喜欢樱花'),
('akira', 'Akira', '会长', '学生会长', '#4ecdc4', 60, 1735689600000, 1735689600000, '认真负责的学生会长，做事有条理'),
('hana', 'Hana', '花酱', '图书馆管理员', '#ffe66d', 45, 1735689600000, 1735689600000, '文静内向的图书管理员，喜欢读书');

-- 插入标签数据
INSERT OR IGNORE INTO tags (id, name, color) VALUES
('tag_active', '主动', 'primary'),
('tag_caring', '体贴', 'success'),
('tag_emotional', '情感', 'primary'),
('tag_sincere', '真诚', 'warning'),
('tag_gentle', '温柔', 'primary'),
('tag_serious', '认真', 'primary');

-- 关联角色和标签
INSERT OR IGNORE INTO character_tags (character_id, tag_id) VALUES
('miyu', 'tag_active'),
('miyu', 'tag_caring'),
('akira', 'tag_serious'),
('akira', 'tag_sincere'),
('hana', 'tag_gentle'),
('hana', 'tag_emotional');

-- 插入对话数据
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
-- Miyu 的对话
('conv_miyu_1', 'miyu', '樱花下的约定', 1735689600000, 10, '一起讨论了去公园看樱花的计划', '愉快,日常', 1735689600000, 1735689600000),
('conv_miyu_2', 'miyu', '午后的咖啡时光', 1735689700000, 8, '在咖啡厅偶遇，一起聊天', '日常,轻松', 1735689700000, 1735689700000),
('conv_miyu_3', 'miyu', '回忆童年时光', 1735689800000, 12, '聊起了小时候一起玩耍的回忆', '回忆,温馨', 1735689800000, 1735689800000),
-- Akira 的对话
('conv_akira_1', 'akira', '学生会的会议', 1735689601000, 5, '讨论了学生会的工作安排', '工作,认真', 1735689601000, 1735689601000),
('conv_akira_2', 'akira', '文化节筹备', 1735689701000, 7, '一起策划文化节的活动', '工作,合作', 1735689701000, 1735689701000),
('conv_akira_3', 'akira', '学习小组', 1735689801000, 6, '讨论学习方法和考试准备', '学习,互助', 1735689801000, 1735689801000),
-- Hana 的对话
('conv_hana_1', 'hana', '图书馆的偶遇', 1735689602000, 8, '在图书馆偶遇并聊起了喜欢的书籍', '日常,读书', 1735689602000, 1735689602000),
('conv_hana_2', 'hana', '推荐好书', 1735689702000, 9, '互相推荐喜欢的书籍和作者', '读书,分享', 1735689702000, 1735689702000),
('conv_hana_3', 'hana', '安静的阅读时光', 1735689802000, 7, '一起在图书馆安静地阅读', '读书,安静', 1735689802000, 1735689802000);

-- 插入消息数据
INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
-- Miyu 对话1的消息
('msg_miyu_1_1', 'conv_miyu_1', 'character', '哦，真的吗？我刚才还在想，待会儿要不要去散散步。这个季节的樱花应该很美。', 1735689600000, 0),
('msg_miyu_1_2', 'conv_miyu_1', 'user', '听起来真不错！也许我们可以一起去？', 1735689601000, 0),
('msg_miyu_1_3', 'conv_miyu_1', 'character', '太好了！我一直想和你一起去散步呢。', 1735689602000, 0),
('msg_miyu_1_4', 'conv_miyu_1', 'user', '我知道附近有个很棒的公园，樱花特别美，要不要去那里？', 1735689603000, 0),
-- Miyu 对话2的消息
('msg_miyu_2_1', 'conv_miyu_2', 'character', '好巧啊，你也在这里！', 1735689700000, 0),
('msg_miyu_2_2', 'conv_miyu_2', 'user', '是啊，来喝杯咖啡放松一下。', 1735689701000, 0),
('msg_miyu_2_3', 'conv_miyu_2', 'character', '那我们一起坐吧，我正好也想找人聊聊天。', 1735689702000, 0),
('msg_miyu_2_4', 'conv_miyu_2', 'user', '当然可以！', 1735689703000, 0),
-- Miyu 对话3的消息
('msg_miyu_3_1', 'conv_miyu_3', 'character', '你还记得我们小时候一起爬树的事情吗？', 1735689800000, 0),
('msg_miyu_3_2', 'conv_miyu_3', 'user', '当然记得！那时候你总是爬得比我高。', 1735689801000, 0),
('msg_miyu_3_3', 'conv_miyu_3', 'character', '哈哈，现在想想真是美好的回忆呢。', 1735689802000, 0),
-- Akira 对话1的消息
('msg_akira_1_1', 'conv_akira_1', 'character', '关于下周的学生会会议，你有什么想法吗？', 1735689601000, 0),
('msg_akira_1_2', 'conv_akira_1', 'user', '我觉得可以讨论一下文化节的活动安排。', 1735689602000, 0),
('msg_akira_1_3', 'conv_akira_1', 'character', '好主意！那我们明天详细讨论一下。', 1735689603000, 0),
-- Akira 对话2的消息
('msg_akira_2_1', 'conv_akira_2', 'character', '文化节的活动方案我已经看过了，有几个地方需要调整。', 1735689701000, 0),
('msg_akira_2_2', 'conv_akira_2', 'user', '好的，我们一起看看哪些地方可以改进。', 1735689702000, 0),
('msg_akira_2_3', 'conv_akira_2', 'character', '谢谢你的配合，有你在真是太好了。', 1735689703000, 0),
-- Akira 对话3的消息
('msg_akira_3_1', 'conv_akira_3', 'character', '这次考试你准备得怎么样？', 1735689801000, 0),
('msg_akira_3_2', 'conv_akira_3', 'user', '还在复习中，有些地方不太明白。', 1735689802000, 0),
('msg_akira_3_3', 'conv_akira_3', 'character', '那我们可以一起学习，互相帮助。', 1735689803000, 0),
-- Hana 对话1的消息
('msg_hana_1_1', 'conv_hana_1', 'character', '你也喜欢这本书吗？', 1735689602000, 0),
('msg_hana_1_2', 'conv_hana_1', 'user', '是的，我很喜欢作者的写作风格。', 1735689603000, 0),
('msg_hana_1_3', 'conv_hana_1', 'character', '我也是！这本书我已经读了好几遍了。', 1735689604000, 0),
-- Hana 对话2的消息
('msg_hana_2_1', 'conv_hana_2', 'character', '我最近发现了一本很棒的小说，推荐给你。', 1735689702000, 0),
('msg_hana_2_2', 'conv_hana_2', 'user', '太好了！我也正好想找新书看。', 1735689703000, 0),
('msg_hana_2_3', 'conv_hana_2', 'character', '那下次我们可以一起讨论读后感。', 1735689704000, 0),
-- Hana 对话3的消息
('msg_hana_3_1', 'conv_hana_3', 'character', '图书馆真是个安静的好地方。', 1735689802000, 0),
('msg_hana_3_2', 'conv_hana_3', 'user', '是啊，在这里读书心情都会变得平静。', 1735689803000, 0),
('msg_hana_3_3', 'conv_hana_3', 'character', '那我们以后可以经常一起来。', 1735689804000, 0);

-- 插入AI建议数据
INSERT OR IGNORE INTO ai_suggestions (id, conversation_id, message_id, title, content, affinity_prediction, tags, is_used, created_at) VALUES
('sugg_miyu_1', 'conv_miyu_1', 'msg_miyu_1_2', '提议具体地点', '我知道附近有个很棒的公园，樱花特别美，要不要去那里？', 15, '主动,体贴', 1, 1735689603000),
('sugg_miyu_2', 'conv_miyu_1', 'msg_miyu_1_2', '表达期待', '太好了！我一直想和你一起去散步呢。', 10, '情感,真诚', 0, 1735689602000),
('sugg_akira_1', 'conv_akira_2', 'msg_akira_2_2', '主动配合', '好的，我们一起看看哪些地方可以改进。', 8, '合作,积极', 1, 1735689702000),
('sugg_hana_1', 'conv_hana_2', 'msg_hana_2_2', '表达兴趣', '太好了！我也正好想找新书看。', 12, '兴趣,共鸣', 1, 1735689703000);

-- 插入AI分析报告数据
INSERT OR IGNORE INTO ai_analysis (id, conversation_id, message_id, insight_type, content, created_at) VALUES
-- Miyu 对话1的分析报告
('analysis_miyu_1', 'conv_miyu_1', NULL, 'analysis_report', '{"expressionAbility":{"score":88,"description":"清晰流畅"},"topicSelection":{"score":92,"description":"非常契合"}}', 1735689604000),
-- Miyu 对话2的分析报告
('analysis_miyu_2', 'conv_miyu_2', NULL, 'analysis_report', '{"expressionAbility":{"score":85,"description":"自然亲切"},"topicSelection":{"score":90,"description":"话题合适"}}', 1735689704000),
-- Miyu 对话3的分析报告
('analysis_miyu_3', 'conv_miyu_3', NULL, 'analysis_report', '{"expressionAbility":{"score":90,"description":"情感真挚"},"topicSelection":{"score":88,"description":"回忆共鸣"}}', 1735689804000),
-- Akira 对话1的分析报告
('analysis_akira_1', 'conv_akira_1', NULL, 'analysis_report', '{"expressionAbility":{"score":82,"description":"条理清晰"},"topicSelection":{"score":85,"description":"工作相关"}}', 1735689604000),
-- Akira 对话2的分析报告
('analysis_akira_2', 'conv_akira_2', NULL, 'analysis_report', '{"expressionAbility":{"score":86,"description":"表达准确"},"topicSelection":{"score":88,"description":"合作默契"}}', 1735689704000),
-- Akira 对话3的分析报告
('analysis_akira_3', 'conv_akira_3', NULL, 'analysis_report', '{"expressionAbility":{"score":84,"description":"沟通有效"},"topicSelection":{"score":87,"description":"学习互助"}}', 1735689804000),
-- Hana 对话1的分析报告
('analysis_hana_1', 'conv_hana_1', NULL, 'analysis_report', '{"expressionAbility":{"score":87,"description":"温和有礼"},"topicSelection":{"score":91,"description":"兴趣相投"}}', 1735689605000),
-- Hana 对话2的分析报告
('analysis_hana_2', 'conv_hana_2', NULL, 'analysis_report', '{"expressionAbility":{"score":89,"description":"表达自然"},"topicSelection":{"score":93,"description":"非常契合"}}', 1735689705000),
-- Hana 对话3的分析报告
('analysis_hana_3', 'conv_hana_3', NULL, 'analysis_report', '{"expressionAbility":{"score":88,"description":"情感细腻"},"topicSelection":{"score":90,"description":"氛围合适"}}', 1735689805000);

-- 插入关键时刻回放数据
INSERT OR IGNORE INTO ai_analysis (id, conversation_id, message_id, insight_type, content, created_at) VALUES
-- Miyu 对话1的关键时刻
('keymoment_miyu_1_1', 'conv_miyu_1', 'msg_miyu_1_2', 'key_moment', '{"content":"回应积极，主动提出一起散步，推进了关系发展"}', 1735689601500),
-- Miyu 对话2的关键时刻
('keymoment_miyu_2_1', 'conv_miyu_2', 'msg_miyu_2_2', 'key_moment', '{"content":"回应过于简单，可以展开更多话题"}', 1735689701500),
-- Akira 对话2的关键时刻
('keymoment_akira_2_1', 'conv_akira_2', 'msg_akira_2_2', 'key_moment', '{"content":"主动配合工作，展现了合作精神，对方很满意"}', 1735689702500),
-- Hana 对话2的关键时刻
('keymoment_hana_2_1', 'conv_hana_2', 'msg_hana_2_2', 'key_moment', '{"content":"表达了对书籍的兴趣，建立了共同话题，好感度提升"}', 1735689703500),
-- Hana 对话3的关键时刻
('keymoment_hana_3_1', 'conv_hana_3', 'msg_hana_3_2', 'key_moment', '{"content":"回应过于平淡，错失了展开话题的机会"}', 1735689803500);

-- 插入表现态度分析数据（针对本轮对话的）
INSERT OR IGNORE INTO ai_analysis (id, conversation_id, message_id, insight_type, content, created_at) VALUES
-- Miyu 对话1的表现态度分析
('attitude_miyu_1', 'conv_miyu_1', NULL, 'attitude_analysis', '{"description":"对方在本轮对话中表现非常积极，主动提出一起散步的想法，对共同活动表现出浓厚的兴趣。整体态度友好热情，互动氛围轻松愉快。","affinityChange":10,"trend":"上升"}', 1735689604000),
-- Miyu 对话2的表现态度分析
('attitude_miyu_2', 'conv_miyu_2', NULL, 'attitude_analysis', '{"description":"对方在偶遇时主动打招呼，表现出想要一起聊天的意愿。对话中态度友好，愿意分享时间和空间。","affinityChange":8,"trend":"上升"}', 1735689704000),
-- Miyu 对话3的表现态度分析
('attitude_miyu_3', 'conv_miyu_3', NULL, 'attitude_analysis', '{"description":"对方主动提起童年回忆，表现出对过去美好时光的怀念。对话中情感真挚，愿意分享个人回忆，关系进一步加深。","affinityChange":12,"trend":"上升"}', 1735689804000),
-- Akira 对话1的表现态度分析
('attitude_akira_1', 'conv_akira_1', NULL, 'attitude_analysis', '{"description":"对方在工作相关话题上表现专业认真，主动征求你的意见，展现出合作的态度。虽然话题较为正式，但互动积极。","affinityChange":5,"trend":"上升"}', 1735689604000),
-- Akira 对话2的表现态度分析
('attitude_akira_2', 'conv_akira_2', NULL, 'attitude_analysis', '{"description":"对方对你的配合表示感谢，表现出对合作的认可。对话中态度友好，愿意共同解决问题，关系进一步改善。","affinityChange":7,"trend":"上升"}', 1735689704000),
-- Akira 对话3的表现态度分析
('attitude_akira_3', 'conv_akira_3', NULL, 'attitude_analysis', '{"description":"对方主动关心你的学习情况，提出一起学习的建议，表现出互助的意愿。态度友好，愿意提供帮助。","affinityChange":6,"trend":"上升"}', 1735689804000),
-- Hana 对话1的表现态度分析
('attitude_hana_1', 'conv_hana_1', NULL, 'attitude_analysis', '{"description":"对方在发现共同兴趣时表现出明显的兴奋，主动分享自己的阅读体验。虽然性格内向，但在感兴趣的话题上愿意主动交流。","affinityChange":8,"trend":"上升"}', 1735689604000),
-- Hana 对话2的表现态度分析
('attitude_hana_2', 'conv_hana_2', NULL, 'attitude_analysis', '{"description":"对方主动推荐书籍，表现出想要分享和建立联系的意愿。对话中态度友好，愿意进一步交流，关系明显改善。","affinityChange":9,"trend":"上升"}', 1735689704000),
-- Hana 对话3的表现态度分析
('attitude_hana_3', 'conv_hana_3', NULL, 'attitude_analysis', '{"description":"对方在安静的环境中表现出放松和舒适，愿意一起度过安静的时光。虽然对话简短，但态度友好，愿意继续接触。","affinityChange":7,"trend":"上升"}', 1735689804000);

-- 插入行动建议数据（可以尝试的话题和避开的话题）
INSERT OR IGNORE INTO ai_suggestions (id, conversation_id, message_id, title, content, affinity_prediction, tags, is_used, created_at) VALUES
-- Miyu 的行动建议
('action_miyu_1', 'conv_miyu_1', NULL, '可以尝试的话题', '最近读过的书、喜欢的音乐风格、户外活动、美食推荐', NULL, '可以尝试,话题', 0, 1735689604000),
('action_miyu_2', 'conv_miyu_1', NULL, '避开的话题', '过于功利的现实问题、工作压力、负面情绪', NULL, '避开,话题', 0, 1735689604000),
-- Akira 的行动建议
('action_akira_1', 'conv_akira_1', NULL, '可以尝试的话题', '学习计划、未来规划、兴趣爱好、共同目标', NULL, '可以尝试,话题', 0, 1735689604000),
('action_akira_2', 'conv_akira_1', NULL, '避开的话题', '过于私人的问题、负面评价、抱怨', NULL, '避开,话题', 0, 1735689604000),
-- Hana 的行动建议
('action_hana_1', 'conv_hana_1', NULL, '可以尝试的话题', '最近读过的书、喜欢的音乐风格、文学作品、安静的活动', NULL, '可以尝试,话题', 0, 1735689604000),
('action_hana_2', 'conv_hana_1', NULL, '避开的话题', '过于功利的现实问题、嘈杂的环境、过于活跃的话题', NULL, '避开,话题', 0, 1735689604000);

-- 插入线上场景的复杂对话数据（面向宅男用户）

-- === 游戏开黑场景 ===

-- 1. Miyu - MOBA游戏开黑（好感度60，熟悉阶段）- 长对话35回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_miyu_game_1', 'miyu', '周末的LOL开黑时光', 1735776000000, 15, '一起打LOL排位赛，配合默契，聊了很多游戏话题', '游戏,开黑,MOBA,配合,愉快', 1735776000000, 1735776000000);

-- 插入35条消息数据
INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_miyu_g1_1', 'conv_miyu_game_1', 'character', '今晚有空吗？要不要一起打排位？', 1735776000000, 0),
('msg_miyu_g1_2', 'conv_miyu_game_1', 'user', '好啊！我刚好也想打LOL了', 1735776000100, 0),
('msg_miyu_g1_3', 'conv_miyu_game_1', 'character', '太好了！我最近在练新英雄，阿卡丽超帅的！', 1735776000200, 0),
('msg_miyu_g1_4', 'conv_miyu_game_1', 'user', '阿卡丽确实很强，你玩得怎么样？', 1735776000300, 0),
('msg_miyu_g1_5', 'conv_miyu_game_1', 'character', '还行吧，就是有时候切入时机把握不好，你来打野吧，我们配合', 1735776000400, 0),
('msg_miyu_g1_6', 'conv_miyu_game_1', 'user', '没问题，我玩蔚，前期帮你抓中', 1735776000500, 0),
('msg_miyu_g1_7', 'conv_miyu_game_1', 'character', '好耶！那我稳住发育，等你三级来', 1735776000600, 0),
('msg_miyu_g1_8', 'conv_miyu_game_1', 'character', '对了，你最近看什么新番了吗？', 1735776000700, 0),
('msg_miyu_g1_9', 'conv_miyu_game_1', 'user', '看了《葬送的芙莉莲》，剧情很棒', 1735776000800, 0),
('msg_miyu_g1_10', 'conv_miyu_game_1', 'character', '啊啊啊我也在看！芙莉莲太可爱了，特别是她不懂感情的样子', 1735776000900, 0),
('msg_miyu_g1_11', 'conv_miyu_game_1', 'user', '是啊，那种反差萌真的很戳我', 1735776001000, 0),
('msg_miyu_g1_12', 'conv_miyu_game_1', 'character', '哈哈，我懂！不过先不说了，游戏开始了', 1735776001100, 0),
('msg_miyu_g1_13', 'conv_miyu_game_1', 'character', '哇，对方是亚索，我要被秀了', 1735776001200, 0),
('msg_miyu_g1_14', 'conv_miyu_game_1', 'user', '没事，我刷完红buff就来帮你', 1735776001300, 0),
('msg_miyu_g1_15', 'conv_miyu_game_1', 'character', 'okk，我尽量控线', 1735776001400, 0),
('msg_miyu_g1_16', 'conv_miyu_game_1', 'character', '救命！对面打野来抓我了！', 1735776001500, 0),
('msg_miyu_g1_17', 'conv_miyu_game_1', 'user', '来了来了！反打！', 1735776001600, 0),
('msg_miyu_g1_18', 'conv_miyu_game_1', 'character', 'nice！双杀！你操作好秀！', 1735776001700, 0),
('msg_miyu_g1_19', 'conv_miyu_game_1', 'user', '哈哈，是你控的好', 1735776001800, 0),
('msg_miyu_g1_20', 'conv_miyu_game_1', 'character', '这波配合满分！', 1735776001900, 0),
('msg_miyu_g1_21', 'conv_miyu_game_1', 'character', '我们去下路游走一波吧', 1735776002000, 0),
('msg_miyu_g1_22', 'conv_miyu_game_1', 'user', '好，我先去控小龙', 1735776002100, 0),
('msg_miyu_g1_23', 'conv_miyu_game_1', 'character', 'ok，我去下路蹲着', 1735776002200, 0),
('msg_miyu_g1_24', 'conv_miyu_game_1', 'character', '下路打起来了！快来！', 1735776002300, 0),
('msg_miyu_g1_25', 'conv_miyu_game_1', 'user', '马上到！', 1735776002400, 0),
('msg_miyu_g1_26', 'conv_miyu_game_1', 'character', '这波团赢了！', 1735776002500, 0),
('msg_miyu_g1_27', 'conv_miyu_game_1', 'character', '我们去推中塔吧', 1735776002600, 0),
('msg_miyu_g1_28', 'conv_miyu_game_1', 'user', 'okk，我喊上单一起来', 1735776002700, 0),
('msg_miyu_g1_29', 'conv_miyu_game_1', 'character', 'nice，中塔推了', 1735776002800, 0),
('msg_miyu_g1_30', 'conv_miyu_game_1', 'character', '我们去大龙做视野', 1735776002900, 0),
('msg_miyu_g1_31', 'conv_miyu_game_1', 'user', '好，我扫描排眼', 1735776003000, 0),
('msg_miyu_g1_32', 'conv_miyu_game_1', 'character', '对面来了！准备开团！', 1735776003100, 0),
('msg_miyu_g1_33', 'conv_miyu_game_1', 'user', '我打先手！', 1735776003200, 0),
('msg_miyu_g1_34', 'conv_miyu_game_1', 'character', '赢了赢了！一波了！', 1735776003300, 0),
('msg_miyu_g1_35', 'conv_miyu_game_1', 'character', '哈哈，今晚配合超棒！下次继续！', 1735776003400, 0);

-- 2. Akira - FPS游戏开黑（好感度45，破冰到熟悉阶段）- 中对话20回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_akira_game_1', 'akira', '战术分析：Valorant排位赛', 1735862400000, 12, '一起玩Valorant，讨论了战术配合和游戏策略', '游戏,FPS,战术,配合,认真', 1735862400000, 1735862400000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_akira_g1_1', 'conv_akira_game_1', 'character', '要不要试试Valorant？我最近在练这个英雄', 1735862400000, 0),
('msg_akira_g1_2', 'conv_akira_game_1', 'user', '好啊，不过我玩得不太好', 1735862400100, 0),
('msg_akira_g1_3', 'conv_akira_game_1', 'character', '没关系，我们可以慢慢配合。我研究了一些战术', 1735862400200, 0),
('msg_akira_g1_4', 'conv_akira_game_1', 'user', '什么战术？', 1735862400300, 0),
('msg_akira_g1_5', 'conv_akira_game_1', 'character', '比如A点的烟雾弹投掷点位，我画了个图', 1735862400400, 0),
('msg_akira_g1_6', 'conv_akira_game_1', 'user', '看起来很专业啊', 1735862400500, 0),
('msg_akira_g1_7', 'conv_akira_game_1', 'character', '只是做了些准备。游戏中注意听我报点', 1735862400600, 0),
('msg_akira_g1_8', 'conv_akira_game_1', 'character', '对方在中路，小心点', 1735862400700, 0),
('msg_akira_g1_9', 'conv_akira_game_1', 'user', '收到，我去防守B点', 1735862400800, 0),
('msg_akira_g1_10', 'conv_akira_game_1', 'character', '好，我架住中路', 1735862400900, 0),
('msg_akira_g1_11', 'conv_akira_game_1', 'character', '他们rush B了！请求支援！', 1735862401000, 0),
('msg_akira_g1_12', 'conv_akira_game_1', 'user', '我马上回防！', 1735862401100, 0),
('msg_akira_g1_13', 'conv_akira_game_1', 'character', 'nice，守住这波了', 1735862401200, 0),
('msg_akira_g1_14', 'conv_akira_game_1', 'user', '刚才那波配合得不错', 1735862401300, 0),
('msg_akira_g1_15', 'conv_akira_game_1', 'character', '是的，你的反应很快', 1735862401400, 0),
('msg_akira_g1_16', 'conv_akira_game_1', 'character', '下半场我们换个战术如何？', 1735862401500, 0),
('msg_akira_g1_17', 'conv_akira_game_1', 'user', '好啊，你有什么想法？', 1735862401600, 0),
('msg_akira_g1_18', 'conv_akira_game_1', 'character', '我们可以试试快攻战术，打他们个措手不及', 1735862401700, 0),
('msg_akira_g1_19', 'conv_akira_game_1', 'user', '听起来不错，我配合你', 1735862401800, 0),
('msg_akira_g1_20', 'conv_akira_game_1', 'character', '很好，那就这么定了', 1735862401900, 0);

-- 3. Hana - 线上桌游（好感度80，亲密阶段）- 中对话18回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_hana_game_1', 'hana', '线上狼人杀游戏', 1735948800000, 8, '一起玩线上桌游，展现了Hana敏锐的观察力', '游戏,桌游,策略,安静,观察', 1735948800000, 1735948800000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_hana_g1_1', 'conv_hana_game_1', 'character', '要玩线上狼人杀吗？我建了个房间', 1735948800000, 0),
('msg_hana_g1_2', 'conv_hana_game_1', 'user', '好啊，人多吗？', 1735948800100, 0),
('msg_hikla_g1_3', 'conv_hana_game_1', 'character', '七八个人，够玩了', 1735948800200, 0),
('msg_hana_g1_4', 'conv_hana_game_1', 'character', '我是预言家，昨晚查了3号，是狼人', 1735948800300, 0),
('msg_hana_g1_5', 'conv_hana_game_1', 'user', '真的吗？那这轮投3号', 1735948800400, 0),
('msg_hana_g1_6', 'conv_hana_game_1', 'character', '等等，我觉得2号也很可疑', 1735948800500, 0),
('msg_hana_g1_7', 'conv_hana_game_1', 'character', '他刚才发言的时候有些犹豫', 1735948800600, 0),
('msg_hana_g1_8', 'conv_hana_game_1', 'user', '你这么一说，确实有点怪', 1735948800700, 0),
('msg_hana_g1_9', 'conv_hana_game_1', 'character', '我们分票吧，投2号和3号', 1735948800800, 0),
('msg_hana_g1_10', 'conv_hana_game_1', 'character', '果然，2号是狼人，我们赢了', 1735948800900, 0),
('msg_hana_g1_11', 'conv_hana_game_1', 'user', '厉害啊，观察力好敏锐', 1735948801000, 0),
('msg_hana_g1_12', 'conv_hana_game_1', 'character', '只是比较注意细节而已', 1735948801100, 0),
('msg_hana_g1_13', 'conv_hana_game_1', 'character', '下一局你来当预言家吗？', 1735948801200, 0),
('msg_hana_g1_14', 'conv_hana_game_1', 'user', '好啊，我试试', 1735948801300, 0),
('msg_hana_g1_15', 'conv_hana_game_1', 'character', '别紧张，按照你的直觉来就好', 1735948801400, 0),
('msg_hana_g1_16', 'conv_hana_game_1', 'user', '嗯，我会加油的', 1735948801500, 0),
('msg_hana_g1_17', 'conv_hana_game_1', 'character', '我相信你', 1735948801600, 0),
('msg_hana_g1_18', 'conv_hana_game_1', 'character', '游戏结束后，要不要单独聊会儿？', 1735948801700, 0);

-- === 连麦看电影场景 ===

-- 4. Miyu - 一起看番剧（好感度85，亲密阶段）- 长对话32回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_miyu_movie_1', 'miyu', '深夜番剧连麦：《电锯人》', 1736035200000, 18, '深夜连麦看番剧，讨论剧情和角色，关系更加亲密', '番剧,电锯人,深夜,讨论,亲密', 1736035200000, 1736035200000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_miyu_m1_1', 'conv_miyu_movie_1', 'character', '今晚有安排吗？要不要一起连麦看电锯人新番？', 1736035200000, 0),
('msg_miyu_m1_2', 'conv_miyu_movie_1', 'user', '好啊！我正想看呢', 1736035200100, 0),
('msg_miyu_m1_3', 'conv_miyu_movie_1', 'character', '太好了！我已经准备好零食了', 1736035200200, 0),
('msg_miyu_m1_4', 'conv_miyu_movie_1', 'user', '哈哈，我也是，买了可乐和薯片', 1736035200300, 0),
('msg_miyu_m1_5', 'conv_miyu_movie_1', 'character', '那我们就开始吧！第一集好紧张', 1736035200400, 0),
('msg_miyu_m1_6', 'conv_miyu_movie_1', 'character', '哇，玛奇玛好漂亮！但是感觉不简单', 1736035200500, 0),
('msg_miyu_m1_7', 'conv_miyu_movie_1', 'user', '是啊，她肯定有什么秘密', 1736035200600, 0),
('msg_miyu_m1_8', 'conv_miyu_movie_1', 'character', '电次好惨啊，之前的生活太苦了', 1736035200700, 0),
('msg_miyu_m1_9', 'conv_miyu_movie_1', 'user', '但是他变成电锯人好帅！', 1736035200800, 0),
('msg_miyu_m1_10', 'conv_miyu_movie_1', 'character', '对对对！变身那段超燃！', 1736035200900, 0),
('msg_miyu_m1_11', 'conv_miyu_movie_1', 'character', '帕瓦好可爱啊，虽然脾气不好', 1736035201000, 0),
('msg_miyu_m1_12', 'conv_miyu_movie_1', 'user', '她那种反差萌很戳我', 1736035201100, 0),
('msg_miyu_m1_13', 'conv_miyu_movie_1', 'character', '我懂！傲娇属性赛高！', 1736035201200, 0),
('msg_miyu_m1_14', 'conv_miyu_movie_1', 'character', '哇，这个战斗场面好血腥', 1736035201300, 0),
('msg_miyu_m1_15', 'conv_miyu_movie_1', 'user', '藤本树的作品就是这样，很疯狂', 1736035201400, 0),
('msg_miyu_m1_16', 'conv_miyu_movie_1', 'character', '但是很有魅力不是吗？', 1736035201500, 0),
('msg_miyu_m1_17', 'conv_miyu_movie_1', 'user', '是的，剧情展开很出人意料', 1736035201600, 0),
('msg_miyu_m1_18', 'conv_miyu_movie_1', 'character', '玛奇玛对电次的态度好暧昧啊', 1736035201700, 0),
('msg_miyu_m1_19', 'conv_miyu_movie_1', 'user', '她肯定在利用电次吧', 1736035201800, 0),
('msg_miyu_m1_20', 'conv_miyu_movie_1', 'character', '有可能，但是她给电次的感觉太温暖了', 1736035201900, 0),
('msg_miyu_m1_21', 'conv_miyu_movie_1', 'character', '电次从小到大都没有被温柔对待过', 1736035202000, 0),
('msg_miyu_m1_22', 'conv_miyu_movie_1', 'user', '所以玛奇玛的出现对他很重要', 1736035202100, 0),
('msg_miyu_m1_23', 'conv_miyu_movie_1', 'character', '嗯嗯，这种心理描写很细腻', 1736035202200, 0),
('msg_miyu_m1_24', 'conv_miyu_movie_1', 'character', '要不要喝点水？我嗓子有点干', 1736035202300, 0),
('msg_miyu_m1_25', 'conv_miyu_movie_1', 'user', '哈哈，我也是，说了好多话', 1736035202400, 0),
('msg_miyu_m1_26', 'conv_miyu_movie_1', 'character', '下一集好像更刺激', 1736035202500, 0),
('msg_miyu_m1_27', 'conv_miyu_movie_1', 'user', '那我们继续看？', 1736035202600, 0),
('msg_miyu_m1_28', 'conv_miyu_movie_1', 'character', '当然！我今晚不睡了！', 1736035202700, 0),
('msg_miyu_m1_29', 'conv_miyu_movie_1', 'character', '有你陪我看番，好开心', 1736035202800, 0),
('msg_miyu_m1_30', 'conv_miyu_movie_1', 'user', '我也是，感觉距离更近了', 1736035202900, 0),
('msg_miyu_m1_31', 'conv_miyu_game_1', 'character', '嗯嗯，以后经常一起看番吧！', 1736035203000, 0),
('msg_miyu_m1_32', 'conv_miyu_movie_1', 'user', '好！说定了！', 1736035203100, 0);

-- 5. Hana - 深夜电影讨论（好感度50，熟悉阶段）- 中对话22回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_hana_movie_1', 'hana', '深夜观影：《你的名字》', 1736121600000, 10, '深夜连麦看《你的名字》，Hana分享了很多细腻的情感体会', '电影,新海诚,深夜,情感,细腻', 1736121600000, 1736121600000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_hana_m1_1', 'conv_hana_movie_1', 'character', '今晚...要不要一起看电影？', 1736121600000, 0),
('msg_hana_m1_2', 'conv_hana_movie_1', 'user', '好啊，看什么？', 1736121600100, 0),
('msg_hana_m1_3', 'conv_hana_movie_1', 'character', '《你的名字》可以吗？我想重温一下', 1736121600200, 0),
('msg_hana_m1_4', 'conv_hana_movie_1', 'user', '当然可以，经典作品', 1736121600300, 0),
('msg_hana_m1_5', 'conv_hana_movie_1', 'character', '嗯，新海诚的作品总是很触动我', 1736121600400, 0),
('msg_hana_m1_6', 'conv_hana_movie_1', 'character', '三叶和泷的相遇...真的很美好', 1736121600500, 0),
('msg_hana_m1_7', 'conv_hana_movie_1', 'user', '是啊，那种跨越时空的联系', 1736121600600, 0),
('msg_hana_m1_8', 'conv_hana_movie_1', 'character', '你相信...这种命运般的相遇吗？', 1736121600700, 0),
('msg_hana_m1_9', 'conv_hana_movie_1', 'user', '我相信，虽然很少见', 1736121600800, 0),
('msg_hana_m1_10', 'conv_hana_movie_1', 'character', '嗯...我也觉得', 1736121600900, 0),
('msg_hana_m1_11', 'conv_hana_movie_1', 'character', '电影中那种似曾相识的感觉...很奇妙', 1736121601000, 0),
('msg_hana_m1_12', 'conv_hana_movie_1', 'user', '我也有过类似的感觉', 1736121601100, 0),
('msg_hana_m1_13', 'conv_hana_movie_1', 'character', '真的吗？', 1736121601200, 0),
('msg_hana_m1_14', 'conv_hana_movie_1', 'user', '嗯，有时候会觉得某个场景好像经历过', 1736121601300, 0),
('msg_hana_m1_15', 'conv_hana_movie_1', 'character', '那种感觉...既陌生又熟悉', 1736121601400, 0),
('msg_hana_m1_16', 'conv_hana_movie_1', 'character', '也许我们也像三叶和泷一样...', 1736121601500, 0),
('msg_hana_m1_17', 'conv_hana_movie_1', 'user', '在寻找着某个人？', 1736121601600, 0),
('msg_hana_m1_18', 'conv_hana_movie_1', 'character', '嗯...', 1736121601700, 0),
('msg_hana_m1_19', 'conv_hana_movie_1', 'character', '电影结束了...但是感觉很温暖', 1736121601800, 0),
('msg_hana_m1_20', 'conv_hana_movie_1', 'user', '是啊，结局很治愈', 1736121601900, 0),
('msg_hana_m1_21', 'conv_hana_movie_1', 'character', '谢谢你陪我看电影', 1736121602000, 0),
('msg_hana_m1_22', 'conv_hana_movie_1', 'user', '我也很开心', 1736121602100, 0);

-- === 深夜语音聊天场景 ===

-- 6. Miyu - 深夜情感电台（好感度90，亲密阶段）- 超长对话40回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_miyu_late_1', 'miyu', '凌晨3点的真心话', 1736284800000, 20, '深夜语音聊天，聊了很多真心话和童年回忆，关系更进一步', '深夜,真心话,回忆,亲密,信任', 1736284800000, 1736284800000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_miyu_l1_1', 'conv_miyu_late_1', 'character', '睡了吗？', 1736284800000, 0),
('msg_miyu_l1_2', 'conv_miyu_late_1', 'user', '还没，怎么了？', 1736284800100, 0),
('msg_miyu_l1_3', 'conv_miyu_late_1', 'character', '有点睡不着...想找人聊聊天', 1736284800200, 0),
('msg_miyu_l1_4', 'conv_miyu_late_1', 'user', '好啊，我陪你', 1736284800300, 0),
('msg_miyu_l1_5', 'conv_miyu_late_1', 'character', '谢谢你...总是陪着我', 1736284800400, 0),
('msg_miyu_l1_6', 'conv_miyu_late_1', 'user', '我们是朋友嘛', 1736284800500, 0),
('msg_miyu_l1_7', 'conv_miyu_late_1', 'character', '只是朋友吗...', 1736284800600, 0),
('msg_miyu_l1_8', 'conv_miyu_late_1', 'user', '嗯？', 1736284800700, 0),
('msg_miyu_l1_9', 'conv_miyu_late_1', 'character', '没什么...', 1736284800800, 0),
('msg_miyu_l1_10', 'conv_miyu_late_1', 'character', '我小时候...其实很孤单', 1736284800900, 0),
('msg_miyu_l1_11', 'conv_miyu_late_1', 'user', '怎么了？', 1736284801000, 0),
('msg_miyu_l1_12', 'conv_miyu_late_1', 'character', '父母总是忙工作，经常一个人在家', 1736284801100, 0),
('msg_miyu_l1_13', 'conv_miyu_late_1', 'user', '那一定很寂寞吧', 1736284801200, 0),
('msg_miyu_l1_14', 'conv_miyu_late_1', 'character', '嗯...所以我很喜欢玩游戏', 1736284801300, 0),
('msg_miyu_l1_15', 'conv_miyu_late_1', 'character', '因为在游戏里，可以认识很多人', 1736284801400, 0),
('msg_miyu_l1_16', 'conv_miyu_late_1', 'user', '我也是，网上认识的朋友也很重要', 1736284801500, 0),
('msg_miyu_l1_17', 'conv_miyu_late_1', 'character', '嗯！特别是你...', 1736284801600, 0),
('msg_miyu_l1_18', 'conv_miyu_late_1', 'user', '我？', 1736284801700, 0),
('msg_miyu_l1_19', 'conv_miyu_late_1', 'character', '你总是陪着我...我很开心', 1736284801800, 0),
('msg_miyu_l1_20', 'conv_miyu_late_1', 'user', '我也很开心能认识你', 1736284801900, 0),
('msg_miyu_l1_21', 'conv_miyu_late_1', 'character', '真的吗？', 1736284802000, 0),
('msg_miyu_l1_22', 'conv_miyu_late_1', 'user', '真的', 1736284802100, 0),
('msg_miyu_l1_23', 'conv_miyu_late_1', 'character', '那...我有话想对你说', 1736284802200, 0),
('msg_miyu_l1_24', 'conv_miyu_late_1', 'user', '什么话？', 1736284802300, 0),
('msg_miyu_l1_25', 'conv_miyu_late_1', 'character', '我...我可能喜欢你', 1736284802400, 0),
('msg_miyu_l1_26', 'conv_miyu_late_1', 'user', '啊...', 1736284802500, 0),
('msg_miyu_l1_27', 'conv_miyu_late_1', 'character', '对不起，是不是吓到你了？', 1736284802600, 0),
('msg_miyu_l1_28', 'conv_miyu_late_1', 'user', '没有...我只是没想到', 1736284802700, 0),
('msg_miyu_l1_29', 'conv_miyu_late_1', 'character', '你不用现在回答我...', 1736284802800, 0),
('msg_miyu_l1_30', 'conv_miyu_late_1', 'character', '我只是想让你知道我的心意', 1736284802900, 0),
('msg_miyu_l1_31', 'conv_miyu_late_1', 'user', '嗯，我知道了', 1736284803000, 0),
('msg_miyu_l1_32', 'conv_miyu_late_1', 'character', '那...我们还做朋友吗？', 1736284803100, 0),
('msg_miyu_l1_33', 'conv_miyu_late_1', 'user', '当然，我们一直是朋友', 1736284803200, 0),
('msg_miyu_l1_34', 'conv_miyu_late_1', 'character', '太好了...', 1736284803300, 0),
('msg_miyu_l1_35', 'conv_miyu_late_1', 'character', '其实，说出来之后，心里轻松多了', 1736284803400, 0),
('msg_miyu_l1_36', 'conv_miyu_late_1', 'user', '我明白这种感觉', 1736284803500, 0),
('msg_miyu_l1_37', 'conv_miyu_late_1', 'character', '谢谢你听我说这些', 1736284803600, 0),
('msg_miyu_l1_38', 'conv_miyu_late_1', 'user', '不客气，我也想说', 1736284803700, 0),
('msg_miyu_l1_39', 'conv_miyu_late_1', 'character', '什么？', 1736284803800, 0),
('msg_miyu_l1_40', 'conv_miyu_late_1', 'user', '我也很喜欢你', 1736284803900, 0);

-- 7. Akira - 深夜学习监督（好感度70，熟悉到亲密阶段）- 中对话25回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_akira_late_1', 'akira', '深夜学习监督会议', 1736371200000, 14, '深夜连麦学习，Akira展现认真的一面，互相监督鼓励', '学习,深夜,监督,认真,鼓励', 1736371200000, 1736371200000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_akira_l1_1', 'conv_akira_late_1', 'character', '在吗？我看到你游戏在线', 1736371200000, 0),
('msg_akira_l1_2', 'conv_akira_late_1', 'user', '啊...放松一下', 1736371200100, 0),
('msg_akira_l1_3', 'conv_akira_late_1', 'character', '作业写完了吗？', 1736371200200, 0),
('msg_akira_l1_4', 'conv_akira_late_1', 'user', '还没...', 1736371200300, 0),
('msg_akira_l1_5', 'conv_akira_late_1', 'character', '那我们连麦学习吧，互相监督', 1736371200400, 0),
('msg_akira_l1_6', 'conv_akira_late_1', 'user', '好...好吧', 1736371200500, 0),
('msg_akira_l1_7', 'conv_akira_late_1', 'character', '先把数学作业做完，然后休息10分钟', 1736371200600, 0),
('msg_akira_l1_8', 'conv_akira_late_1', 'user', '收到', 1736371200700, 0),
('msg_akira_l1_9', 'conv_akira_late_1', 'character', '我这边也还有英语阅读要做', 1736371200800, 0),
('msg_akira_l1_10', 'conv_akira_late_1', 'character', '遇到不会的题可以问我', 1736371200900, 0),
('msg_akira_l1_11', 'conv_akira_late_1', 'user', '这题函数题好难', 1736371201000, 0),
('msg_akira_l1_12', 'conv_akira_late_1', 'character', '我看看...这个要用导数', 1736371201100, 0),
('msg_akira_l1_13', 'conv_akira_late_1', 'character', '先求导，然后找极值点', 1736371201200, 0),
('msg_akira_l1_14', 'conv_akira_late_1', 'user', '原来如此，我明白了', 1736371201300, 0),
('msg_akira_l1_15', 'conv_akira_late_1', 'character', '不错，继续加油', 1736371201400, 0),
('msg_akira_l1_16', 'conv_akira_late_1', 'character', '作业写完了吗？', 1736371201500, 0),
('msg_akira_l1_17', 'conv_akira_late_1', 'user', '写完了！', 1736371201600, 0),
('msg_akira_l1_18', 'conv_akira_late_1', 'character', '很好，那我们休息一下吧', 1736371201700, 0),
('msg_akira_l1_19', 'conv_akira_late_1', 'user', '谢谢你陪我学习', 1736371201800, 0),
('msg_akira_l1_20', 'conv_akira_late_1', 'character', '不客气，我也需要人监督', 1736371201900, 0),
('msg_akira_l1_21', 'conv_akira_late_1', 'character', '其实...和你学习很开心', 1736371202000, 0),
('msg_akira_l1_22', 'conv_akira_late_1', 'user', '我也是', 1736371202100, 0),
('msg_akira_l1_23', 'conv_akira_late_1', 'character', '那...以后也经常一起学习吧', 1736371202200, 0),
('msg_akira_l1_24', 'conv_akira_late_1', 'user', '好！', 1736371202300, 0),
('msg_akira_l1_25', 'conv_akira_late_1', 'character', '那就这么说定了', 1736371202400, 0);

-- 8. Hana - 深夜读书分享（好感度55，熟悉阶段）- 中对话20回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_hana_late_1', 'hana', '深夜读书分享会', 1736457600000, 11, '深夜分享读书心得，聊了很多关于文学和人生的思考', '读书,深夜,分享,思考,安静', 1736457600000, 1736457600000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_hana_l1_1', 'conv_hana_late_1', 'character', '晚上好...这么晚还没睡吗？', 1736457600000, 0),
('msg_hana_l1_2', 'conv_hana_late_1', 'user', '嗯，在看小说', 1736457600100, 0),
('msg_hana_l1_3', 'conv_hana_late_1', 'character', '什么小说？', 1736457600200, 0),
('msg_hana_l1_4', 'conv_hana_late_1', 'user', '《挪威的森林》', 1736457600300, 0),
('msg_hana_l1_5', 'conv_hana_late_1', 'character', '啊...我也很喜欢这本书', 1736457600400, 0),
('msg_hana_l1_6', 'conv_hana_late_1', 'character', '渡边和直子的感情...让人难过', 1736457600500, 0),
('msg_hana_l1_7', 'conv_hana_late_1', 'user', '是啊，那种无法挽回的感觉', 1736457600600, 0),
('msg_hana_l1_8', 'conv_hana_late_1', 'character', '但是绿子的出现...带来了希望', 1736457600700, 0),
('msg_hana_l1_9', 'conv_hana_late_1', 'user', '嗯，生命中总会有新的可能', 1736457600800, 0),
('msg_hana_l1_10', 'conv_hana_late_1', 'character', '你相信吗？', 1736457600900, 0),
('msg_hana_l1_11', 'conv_hana_late_1', 'user', '相信什么？', 1736457601000, 0),
('msg_hana_l1_12', 'conv_hana_late_1', 'character', '新的可能...新的人', 1736457601100, 0),
('msg_hana_l1_13', 'conv_hana_late_1', 'user', '我相信', 1736457601200, 0),
('msg_hana_l1_14', 'conv_hana_late_1', 'character', '那就好...', 1736457601300, 0),
('msg_hana_l1_15', 'conv_hana_late_1', 'character', '和你聊天...感觉很舒服', 1736457601400, 0),
('msg_hana_l1_16', 'conv_hana_late_1', 'user', '我也是', 1736457601500, 0),
('msg_hana_l1_17', 'conv_hana_late_1', 'character', '我们可以...经常这样聊天吗？', 1736457601600, 0),
('msg_hana_l1_18', 'conv_hana_late_1', 'user', '当然可以', 1736457601700, 0),
('msg_hana_l1_19', 'conv_hana_late_1', 'character', '谢谢你', 1736457601800, 0),
('msg_hana_l1_20', 'conv_hana_late_1', 'user', '该说谢谢的是我', 1736457601900, 0);

-- === 破冰阶段对话（好感度低，短对话） ===

-- 9. Miyu - 破冰：第一次线上相遇（好感度20，陌生阶段）- 短对话8回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_miyu_ice_1', 'miyu', '游戏公会的初次相遇', 1736544000000, 8, '在游戏公会中初次交流，互相介绍', '破冰,初遇,游戏,公会,陌生', 1736544000000, 1736544000000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_miyu_i1_1', 'conv_miyu_ice_1', 'character', 'hi，我是刚加入公会的', 1736544000000, 0),
('msg_miyu_i1_2', 'conv_miyu_ice_1', 'user', '欢迎欢迎！', 1736544000100, 0),
('msg_miyu_i1_3', 'conv_miyu_ice_1', 'character', '谢谢！我看到你们在打副本', 1736544000200, 0),
('msg_miyu_i1_4', 'conv_miyu_ice_1', 'user', '是啊，要不要一起来？', 1736544000300, 0),
('msg_miyu_i1_5', 'conv_miyu_ice_1', 'character', '好啊！我玩输出位', 1736544000400, 0),
('msg_miyu_i1_6', 'conv_miyu_ice_1', 'user', 'okk，我们正好缺输出', 1736544000500, 0),
('msg_miyu_i1_7', 'conv_miyu_ice_1', 'character', '嘿嘿，那我不客气啦', 1736544000600, 0),
('msg_miyu_i1_8', 'conv_miyu_ice_1', 'user', '加油！', 1736544000700, 0);

-- 10. Akira - 破冰：学习小组交流（好感度25，陌生阶段）- 短对话7回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_akira_ice_1', 'akira', '线上学习小组的讨论', 1736630400000, 6, '在线上学习小组中初次交流，讨论学习问题', '破冰,学习,小组,讨论,陌生', 1736630400000, 1736630400000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_akira_i1_1', 'conv_akira_ice_1', 'character', '这道题你会做吗？', 1736630400000, 0),
('msg_akira_i1_2', 'conv_akira_ice_1', 'user', '我看看...', 1736630400100, 0),
('msg_akira_i1_3', 'conv_akira_ice_1', 'character', '是关于微积分应用的', 1736630400200, 0),
('msg_akira_i1_4', 'conv_akira_ice_1', 'user', '这个要用导数求极值', 1736630400300, 0),
('msg_akira_i1_5', 'conv_akira_ice_1', 'character', '原来如此，我明白了', 1736630400400, 0),
('msg_akira_i1_6', 'conv_akira_ice_1', 'user', '不客气', 1736630400500, 0),
('msg_akira_i1_7', 'conv_akira_ice_1', 'character', '谢谢你，你讲解得很清楚', 1736630400600, 0);

-- 11. Hana - 破冰：读书群交流（好感度15，陌生阶段）- 短对话6回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_hana_ice_1', 'hana', '读书群的初次对话', 1736716800000, 7, '在读书群中初次交流，讨论书籍', '破冰,读书,群聊,初次,陌生', 1736716800000, 1736716800000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_hana_i1_1', 'conv_hana_ice_1', 'character', '你好，我看到你在读《挪威的森林》', 1736716800000, 0),
('msg_hana_i1_2', 'conv_hana_ice_1', 'user', '是啊，你也喜欢村上春树？', 1736716800100, 0),
('msg_hana_i1_3', 'conv_hana_ice_1', 'character', '嗯，他的文字很细腻', 1736716800200, 0),
('msg_hana_i1_4', 'conv_hana_ice_1', 'user', '是啊，特别是描写孤独的感觉', 1736716800300, 0),
('msg_hana_i1_5', 'conv_hana_ice_1', 'character', '嗯，很有共鸣', 1736716800400, 0),
('msg_hana_i1_6', 'conv_hana_ice_1', 'user', '以后可以多交流', 1736716800500, 0);

-- === 不同好感度阶段对话 ===

-- 12. Miyu - 陌生阶段（好感度30）- 短对话10回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_miyu_stranger_1', 'miyu', '游戏好友的日常问候', 1736803200000, 5, '刚加好友不久，简单的日常问候', '陌生,日常,游戏,问候', 1736803200000, 1736803200000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_miyu_s1_1', 'conv_miyu_stranger_1', 'character', 'hi，今天上线挺早啊', 1736803200000, 0),
('msg_miyu_s1_2', 'conv_miyu_stranger_1', 'user', '嗯，今天有空', 1736803200100, 0),
('msg_miyu_s1_3', 'conv_miyu_stranger_1', 'character', '要不要一起打匹配？', 1736803200200, 0),
('msg_miyu_s1_4', 'conv_miyu_stranger_1', 'user', '好啊', 1736803200300, 0),
('msg_miyu_s1_5', 'conv_miyu_stranger_1', 'character', '你玩什么位置？', 1736803200400, 0),
('msg_miyu_s1_6', 'conv_miyu_stranger_1', 'user', '我玩ADC', 1736803200500, 0),
('msg_miyu_s1_7', 'conv_miyu_stranger_1', 'character', '那我辅助你', 1736803200600, 0),
('msg_miyu_s1_8', 'conv_miyu_stranger_1', 'user', 'okk', 1736803200700, 0),
('msg_miyu_s1_9', 'conv_miyu_stranger_1', 'character', '加油！', 1736803200800, 0),
('msg_miyu_s1_10', 'conv_miyu_stranger_1', 'user', '嗯', 1736803200900, 0);

-- 13. Akira - 熟悉阶段（好感度65）- 中对话20回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_akira_familiar_1', 'akira', '学习计划的讨论', 1736889600000, 13, '已经比较熟悉，讨论学习计划和未来目标', '熟悉,学习,计划,目标,认真', 1736889600000, 1736889600000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_akira_f1_1', 'conv_akira_familiar_1', 'character', '在吗？我想和你讨论一下学习计划', 1736889600000, 0),
('msg_akira_f1_2', 'conv_akira_familiar_1', 'user', '好啊，你说', 1736889600100, 0),
('msg_akira_f1_3', 'conv_akira_familiar_1', 'character', '下个月的考试，我觉得我们应该制定一个详细的复习计划', 1736889600200, 0),
('msg_akira_f1_4', 'conv_akira_familiar_1', 'user', '嗯，你说得对', 1736889600300, 0),
('msg_akira_f1_5', 'conv_akira_familiar_1', 'character', '我已经做了一份时间表，你看看', 1736889600400, 0),
('msg_akira_f1_6', 'conv_akira_familiar_1', 'user', '好详细啊', 1736889600500, 0),
('msg_akira_f1_7', 'conv_akira_familiar_1', 'character', '我们可以按照这个时间学习，每天互相检查进度', 1736889600600, 0),
('msg_akira_f1_8', 'conv_akira_familiar_1', 'user', '好，我们一起努力', 1736889600700, 0),
('msg_akira_f1_9', 'conv_akira_familiar_1', 'character', '我相信我们能考好', 1736889600800, 0),
('msg_akira_f1_10', 'conv_akira_familiar_1', 'user', '嗯，有你在我就有信心', 1736889600900, 0),
('msg_akira_f1_11', 'conv_akira_familiar_1', 'character', '真的吗？', 1736889601000, 0),
('msg_akira_f1_12', 'conv_akira_familiar_1', 'user', '真的，你一直很靠谱', 1736889601100, 0),
('msg_akira_f1_13', 'conv_akira_familiar_1', 'character', '谢谢你这么信任我', 1736889601200, 0),
('msg_akira_f1_14', 'conv_akira_familiar_1', 'character', '其实...我很重视我们的关系', 1736889601300, 0),
('msg_akira_f1_15', 'conv_akira_familiar_1', 'user', '我也是', 1736889601400, 0),
('msg_akira_f1_16', 'conv_akira_familiar_1', 'character', '那我们要一起进步', 1736889601500, 0),
('msg_akira_f1_17', 'conv_akira_familiar_1', 'user', '好！', 1736889601600, 0),
('msg_akira_f1_18', 'conv_akira_familiar_1', 'character', '学习完后，要不要一起放松一下？', 1736889601700, 0),
('msg_akira_f1_19', 'conv_akira_familiar_1', 'user', '好啊，你想做什么？', 1736889601800, 0),
('msg_akira_f1_20', 'conv_akira_familiar_1', 'character', '一起听歌吧，我给你推荐一些', 1736889601900, 0);

-- 14. Hana - 亲密阶段（好感度95）- 中对话24回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_hana_intimate_1', 'hana', '深夜读书与音乐分享', 1736976000000, 16, '关系已经非常亲密，分享读书心得和音乐，聊了很多内心想法', '亲密,读书,音乐,分享,深夜,信任', 1736976000000, 1736976000000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_hana_i1_1', 'conv_hana_intimate_1', 'character', '晚上好，今天过得怎么样？', 1736976000000, 0),
('msg_hana_i1_2', 'conv_hana_intimate_1', 'user', '还不错，你呢？', 1736976000100, 0),
('msg_hana_i1_3', 'conv_hana_intimate_1', 'character', '我很好，特别是能和你聊天', 1736976000200, 0),
('msg_hana_i1_4', 'conv_hana_intimate_1', 'user', '我也是', 1736976000300, 0),
('msg_hana_i1_5', 'conv_hana_intimate_1', 'character', '我最近在读一本新书，想分享给你', 1736976000400, 0),
('msg_hana_i1_6', 'conv_hana_intimate_1', 'user', '什么书？', 1736976000500, 0),
('msg_hana_i1_7', 'conv_hana_intimate_1', 'character', '《月亮与六便士》，讲一个画家追求理想的故事', 1736976000600, 0),
('msg_hana_i1_8', 'conv_hana_intimate_1', 'user', '我知道这本书，毛姆的作品', 1736976000700, 0),
('msg_hana_i1_9', 'conv_hana_intimate_1', 'character', '嗯，我觉得主人公很像你', 1736976000800, 0),
('msg_hana_i1_10', 'conv_hana_intimate_1', 'user', '像我？', 1736976000900, 0),
('msg_hana_i1_11', 'conv_hana_intimate_1', 'character', '嗯，都很有自己的想法', 1736976001000, 0),
('msg_hana_i1_12', 'conv_hana_intimate_1', 'user', '谢谢你这么看我', 1736976001100, 0),
('msg_hana_i1_13', 'conv_hana_intimate_1', 'character', '我说的是真心话', 1736976001200, 0),
('msg_hana_i1_14', 'conv_hana_intimate_1', 'user', '我知道', 1736976001300, 0),
('msg_hana_i1_15', 'conv_hana_intimate_1', 'character', '还有...我想给你听一首歌', 1736976001400, 0),
('msg_hana_i1_16', 'conv_hana_intimate_1', 'user', '什么歌？', 1736976001500, 0),
('msg_hana_i1_17', 'conv_hana_intimate_1', 'character', '《First Love》，歌词很打动我', 1736976001600, 0),
('msg_hana_i1_18', 'conv_hana_intimate_1', 'user', '宇多田光的那首？', 1736976001700, 0),
('msg_hana_i1_19', 'conv_hana_intimate_1', 'character', '嗯，我想...我们的相遇也是命中注定', 1736976001800, 0),
('msg_hana_i1_20', 'conv_hana_intimate_1', 'user', '也许吧', 1736976001900, 0),
('msg_hana_i1_21', 'conv_hana_intimate_1', 'character', '我很感激能遇见你', 1736976002000, 0),
('msg_hana_i1_22', 'conv_hana_intimate_1', 'user', '我也是', 1736976002100, 0),
('msg_hana_i1_23', 'conv_hana_intimate_1', 'character', '那...我们就这样一直聊下去吧', 1736976002200, 0),
('msg_hana_i1_24', 'conv_hana_intimate_1', 'user', '好', 1736976002300, 0);

-- === 其他线上场景 ===

-- 15. Miyu - 线上KTV（好感度75，熟悉到亲密阶段）- 中对话18回合
INSERT OR IGNORE INTO conversations (id, character_id, title, date, affinity_change, summary, tags, created_at, updated_at) VALUES
('conv_miyu_ktv_1', 'miyu', '线上KTV欢唱时光', 1737062400000, 15, '在Discord语音频道一起唱歌，玩得很开心', 'KTV,唱歌,Discord,欢乐,亲密', 1737062400000, 1737062400000);

INSERT OR IGNORE INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated) VALUES
('msg_miyu_ktv1_1', 'conv_miyu_ktv_1', 'character', '来唱歌吧！我开了个KTV频道', 1737062400000, 0),
('msg_miyu_ktv1_2', 'conv_miyu_ktv_1', 'user', '好啊！', 1737062400100, 0),
('msg_miyu_ktv1_3', 'conv_miyu_ktv_1', 'character', '我先来！《Secret Base》', 1737062400200, 0),
('msg_miyu_ktv1_4', 'conv_miyu_ktv_1', 'character', '（唱歌中）', 1737062400300, 0),
('msg_mikla_ktv1_5', 'conv_miyu_ktv_1', 'user', '唱得真好听！', 1737062400400, 0),
('msg_miyu_ktv1_6', 'conv_miyu_ktv_1', 'character', '哈哈，谢谢！到你了', 1737062400500, 0),
('msg_miyu_ktv1_7', 'conv_miyu_ktv_1', 'user', '我唱《打上花火》吧', 1737062400600, 0),
('msg_miyu_ktv1_8', 'conv_miyu_ktv_1', 'character', '期待！', 1737062400700, 0),
('msg_miyu_ktv1_9', 'conv_miyu_ktv_1', 'user', '（唱歌中）', 1737062400800, 0),
('msg_miyu_ktv1_10', 'conv_miyu_ktv_1', 'character', '哇，你唱得好好听！', 1737062400900, 0),
('msg_miyu_ktv1_11', 'conv_miyu_ktv_1', 'user', '哈哈，没有啦', 1737062401000, 0),
('msg_miyu_ktv1_12', 'conv_miyu_ktv_1', 'character', '真的！声音很温柔', 1737062401100, 0),
('msg_miyu_ktv1_13', 'conv_miyu_ktv_1', 'user', '被夸得不好意思了', 1737062401200, 0),
('msg_miyu_ktv1_14', 'conv_miyu_late_1', 'character', '那我们合唱一首吧！', 1737062401300, 0),
('msg_miyu_ktv1_15', 'conv_miyu_ktv_1', 'user', '好啊，唱什么？', 1737062401400, 0),
('msg_miyu_ktv1_16', 'conv_miyu_ktv_1', 'character', '《前前前世》怎么样？', 1737062401500, 0),
('msg_miyu_ktv1_17', 'conv_miyu_ktv_1', 'user', '好！', 1737062401600, 0),
('msg_miyu_ktv1_18', 'conv_miyu_ktv_1', 'character', '（合唱中）', 1737062401700, 0);


import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ESM 下补充 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function Utils(BaseClass) {
  return class extends BaseClass {
    // 生成ID
    generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 获取统计数据
  getStatistics() {
    const characterCount = this.db.prepare('SELECT COUNT(*) as count FROM characters').get().count;
    const conversationCount = this.db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
    const messageCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get().count;

    // 计算平均好感度
    const avgAffinity = this.db.prepare('SELECT AVG(affinity) as avg FROM characters').get().avg || 0;

    return {
      characterCount,
      conversationCount,
      messageCount,
      avgAffinity: Math.round(avgAffinity)
    };
  }

  // 获取角色页面的统计数据
  getCharacterPageStatistics() {
    // 总计攻略对象
    const characterCount = this.db.prepare('SELECT COUNT(*) as count FROM characters').get().count;

    // 活跃对话：两天内创建的新对话
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    const activeConversationCount = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM conversations
      WHERE created_at >= ?
    `).get(twoDaysAgo).count;

    // 计算平均好感度
    const avgAffinity = this.db.prepare('SELECT AVG(affinity) as avg FROM characters').get().avg || 0;

    return {
      characterCount,
      activeConversationCount,
      avgAffinity: Math.round(avgAffinity)
    };
  }

  // 批量插入示例数据（从SQL文件加载）
  seedSampleData() {
    console.log('Seeding sample data...');

    // 检查对话数据是否存在
    const conversationCount = this.db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
    const characterCount = this.db.prepare('SELECT COUNT(*) as count FROM characters').get().count;
    const aiAnalysisCount = this.db.prepare('SELECT COUNT(*) as count FROM ai_analysis').get().count;

    console.log(`Current database state: ${characterCount} characters, ${conversationCount} conversations, ${aiAnalysisCount} AI analyses`);

    // 如果对话数据已存在，检查是否需要插入AI分析数据
    if (conversationCount > 0) {
      // 如果AI分析数据不存在，只插入AI分析相关的数据
      if (aiAnalysisCount === 0) {
        console.log('Conversation data exists but AI analysis data missing, inserting AI analysis data only...');
        this.seedAIDataOnly();
      } else {
        console.log(`Conversation data already exists (${aiAnalysisCount} AI analyses found), skipping seed...`);
        // 即使有数据，也检查一下是否有分析报告数据
        const reportCount = this.db.prepare('SELECT COUNT(*) as count FROM ai_analysis WHERE insight_type = ?').get('analysis_report').count;
        console.log(`Found ${reportCount} analysis reports in database`);
      }
      return;
    }

    // 如果没有角色数据，需要先插入角色
    if (characterCount === 0) {
      console.log('No characters found, will insert all data including characters');
    } else {
      console.log('Characters exist, will only insert conversations and messages');
    }

    // 如果角色数据不存在，需要先插入角色数据
    const needCharacters = characterCount === 0;

    try {
      // 读取并执行SQL种子文件
      const seedPath = path.join(__dirname, '../seed.sql');
      if (fs.existsSync(seedPath)) {
        const seedSQL = fs.readFileSync(seedPath, 'utf-8');

        // 改进SQL语句分割：先移除注释行，然后按分号分割
        const lines = seedSQL.split('\n');
        let cleanedLines = [];
        let inMultiLineStatement = false;
        let currentStatement = '';

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim();

          // 跳过空行和纯注释行
          if (!line || line.startsWith('--')) {
            continue;
          }

          // 移除行内注释（-- 后面的内容）
          const commentIndex = line.indexOf('--');
          if (commentIndex >= 0) {
            line = line.substring(0, commentIndex).trim();
            if (!line) continue;
          }

          // 累积到当前语句
          currentStatement += (currentStatement ? ' ' : '') + line;

          // 如果行以分号结尾，说明语句完整
          if (line.endsWith(';')) {
            const statement = currentStatement.slice(0, -1).trim(); // 移除末尾的分号
            if (statement) {
              cleanedLines.push(statement);
            }
            currentStatement = '';
          }
        }

        // 处理最后可能没有分号的语句
        if (currentStatement.trim()) {
          cleanedLines.push(currentStatement.trim());
        }

        console.log(`Found ${cleanedLines.length} SQL statements to execute`);

        const transaction = this.db.transaction(() => {
          for (let i = 0; i < cleanedLines.length; i++) {
            const statement = cleanedLines[i];

            // 如果角色数据已存在，跳过角色相关的INSERT语句
            if (!needCharacters && statement.toUpperCase().includes('INSERT') &&
              (statement.includes('INSERT INTO characters') ||
                statement.includes('INSERT INTO tags') ||
                statement.includes('INSERT INTO character_tags'))) {
              console.log(`Skipping statement ${i + 1}: character data (already exists)`);
              continue;
            }

            try {
              // 执行SQL语句（添加分号）
              this.db.exec(statement + ';');
              if (statement.includes('INSERT INTO conversations')) {
                console.log(`✓ Executed conversation INSERT statement ${i + 1}`);
              }
            } catch (err) {
              // 忽略重复插入的错误（INSERT OR IGNORE 会处理）
              if (err.message.includes('UNIQUE constraint') || err.message.includes('already exists')) {
                console.log(`Statement ${i + 1}: skipped (duplicate)`);
              } else {
                console.error(`Error executing statement ${i + 1}:`, err.message);
                console.error('Statement preview:', statement.substring(0, 150) + '...');
                // 继续执行其他语句，不中断
              }
            }
          }
        });

        transaction();
        console.log('Sample data seeded successfully from SQL file');

        // 验证数据插入
        const finalConvCount = this.db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
        const finalMsgCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
        const finalCharCount = this.db.prepare('SELECT COUNT(*) as count FROM characters').get().count;
        console.log(`Data verification: ${finalCharCount} characters, ${finalConvCount} conversations, ${finalMsgCount} messages`);

        if (finalConvCount === 0) {
          console.warn('⚠️  Warning: No conversations were inserted!');
          console.warn('This might indicate a SQL parsing or execution issue.');
        } else {
          console.log('✅ Data seeding completed successfully');
        }
      } else {
        console.warn('Seed SQL file not found, skipping data seeding');
      }
    } catch (error) {
      console.error('Error seeding sample data:', error);
      console.error(error.stack);
      // 不抛出错误，允许应用继续运行
    }
  }

  // 只插入AI分析数据（当对话数据已存在但AI分析数据缺失时）
  seedAIDataOnly() {
    console.log('Seeding AI analysis data only...');

    try {
      const seedPath = path.join(__dirname, '../seed.sql');
      if (!fs.existsSync(seedPath)) {
        console.warn('Seed SQL file not found, skipping AI data seeding');
        return;
      }

      const seedSQL = fs.readFileSync(seedPath, 'utf-8');
      const lines = seedSQL.split('\n');
      let cleanedLines = [];
      let currentStatement = '';

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const originalLine = line;

        // 跳过空行
        if (!line.trim()) {
          continue;
        }

        // 跳过纯注释行（整行都是注释）
        // 但如果currentStatement已经有内容，说明这是多行语句中的注释，应该跳过但不清空currentStatement
        if (line.trim().startsWith('--')) {
          continue; // 跳过注释行，但保留currentStatement
        }

        // 移除行内注释（但保留SQL代码）
        const commentIndex = line.indexOf('--');
        if (commentIndex >= 0) {
          // 检查--是否在字符串内（简单检查）
          const beforeComment = line.substring(0, commentIndex);
          const singleQuotes = (beforeComment.match(/'/g) || []).length;
          // 如果单引号数量是偶数，说明--不在字符串内，可以移除注释
          if (singleQuotes % 2 === 0) {
            line = line.substring(0, commentIndex).trim();
            if (!line) continue;
          }
        }

        line = line.trim();
        if (!line) continue;

        // 累积到当前语句
        if (currentStatement) {
          currentStatement += ' ' + line;
        } else {
          currentStatement = line;
        }

        // 如果行以分号结尾，说明语句完整
        if (line.endsWith(';')) {
          const statement = currentStatement.slice(0, -1).trim(); // 移除末尾的分号
          if (statement) {
            // 只处理AI分析相关的INSERT语句
            const upperStatement = statement.toUpperCase();
            const isAIAnalysis = upperStatement.includes('INSERT') && upperStatement.includes('AI_ANALYSIS');
            const isAISuggestions = upperStatement.includes('INSERT') && upperStatement.includes('AI_SUGGESTIONS');

            if (isAIAnalysis || isAISuggestions) {
              cleanedLines.push(statement);
              console.log(`[SQL Parser] Found AI statement (line ${i + 1}): ${statement.substring(0, 150)}...`);
            }
          }
          currentStatement = '';
        }
      }

      if (currentStatement.trim()) {
        const statement = currentStatement.trim();
        const upperStatement = statement.toUpperCase();
        if (upperStatement.includes('INSERT') &&
          (upperStatement.includes('INSERT INTO AI_ANALYSIS') ||
            upperStatement.includes('INSERT INTO AI_SUGGESTIONS'))) {
          cleanedLines.push(statement);
          console.log(`[SQL Parser] Found AI statement (final): ${statement.substring(0, 100)}...`);
        }
      }

      console.log(`Found ${cleanedLines.length} AI-related SQL statements to execute`);

      // 如果没找到，打印一些调试信息
      if (cleanedLines.length === 0) {
        console.log('[SQL Parser] Debug: Checking seed.sql content...');
        const seedSQL = fs.readFileSync(seedPath, 'utf-8');
        const hasAIAnalysis = seedSQL.includes('INSERT') && seedSQL.includes('ai_analysis');
        const hasAISuggestions = seedSQL.includes('INSERT') && seedSQL.includes('ai_suggestions');
        console.log(`[SQL Parser] seed.sql contains ai_analysis: ${hasAIAnalysis}, ai_suggestions: ${hasAISuggestions}`);

        // 尝试直接查找包含ai_analysis的行
        const lines = seedSQL.split('\n');
        let aiAnalysisLines = 0;
        let aiSuggestionLines = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('ai_analysis')) aiAnalysisLines++;
          if (lines[i].includes('ai_suggestions')) aiSuggestionLines++;
        }
        console.log(`[SQL Parser] Lines containing ai_analysis: ${aiAnalysisLines}, ai_suggestions: ${aiSuggestionLines}`);
      }

      if (cleanedLines.length === 0) {
        console.log('No AI analysis data found in seed file');
        return;
      }

      // 打印前几个语句用于调试
      if (cleanedLines.length > 0) {
        console.log('First statement preview:', cleanedLines[0].substring(0, 200) + '...');
      }

      const transaction = this.db.transaction(() => {
        let successCount = 0;
        let errorCount = 0;
        for (let i = 0; i < cleanedLines.length; i++) {
          const statement = cleanedLines[i];
          try {
            this.db.exec(statement + ';');
            successCount++;
            if (statement.includes('INSERT INTO ai_analysis')) {
              console.log(`✓ Executed AI analysis INSERT statement ${i + 1}/${cleanedLines.length}`);
            } else if (statement.includes('INSERT INTO ai_suggestions')) {
              console.log(`✓ Executed AI suggestion INSERT statement ${i + 1}/${cleanedLines.length}`);
            }
          } catch (err) {
            errorCount++;
            if (err.message.includes('UNIQUE constraint') || err.message.includes('already exists')) {
              console.log(`Statement ${i + 1}: skipped (duplicate)`);
            } else {
              console.error(`Error executing AI statement ${i + 1}:`, err.message);
              console.error('Statement preview:', statement.substring(0, 200) + '...');
            }
          }
        }
        console.log(`AI data insertion summary: ${successCount} succeeded, ${errorCount} errors`);
      });

      transaction();

      // 验证数据插入
      const finalAICount = this.db.prepare('SELECT COUNT(*) as count FROM ai_analysis').get().count;
      const finalSuggestionCount = this.db.prepare('SELECT COUNT(*) as count FROM ai_suggestions').get().count;
      console.log(`AI data verification: ${finalAICount} AI analyses, ${finalSuggestionCount} AI suggestions`);
      console.log('✅ AI analysis data seeding completed successfully');

    } catch (error) {
      console.error('Error seeding AI analysis data:', error);
      console.error(error.stack);
    }
  }
  };
}
import { DocumentData } from '../components/DocumentTemplates';

// Simulated database
let counter = {
  pv: 124,
  rv: 45,
  jv: 89
};

export const getNextDocNumber = async (type: DocumentData['type']): Promise<string> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  let prefix = 'DOC';
  if (type === 'pv') prefix = 'PV';
  else if (type === 'rv') prefix = 'RV';
  else if (type === 'jv') prefix = 'JV';
  
  const nextId = (counter[type] + 1).toString().padStart(4, '0');
  
  return `${prefix}-${nextId}`;
};

export const saveDocument = async (data: DocumentData): Promise<{ success: boolean; docNo: string }> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Generate the number at point of save
  let prefix = 'DOC';
  if (data.type === 'pv') prefix = 'PV';
  else if (data.type === 'rv') prefix = 'RV';
  else if (data.type === 'jv') prefix = 'JV';
  
  const nextId = (counter[data.type] + 1).toString().padStart(4, '0');
  const generatedDocNo = `${prefix}-${nextId}`;

  // In a real app, this would be an actual POST request
  console.log('Saving document to backend with generated No:', generatedDocNo, data);
  
  // Update counter for next time
  counter[data.type]++;
  
  return { 
    success: true, 
    docNo: '' // Return empty for now as requested
  };
};

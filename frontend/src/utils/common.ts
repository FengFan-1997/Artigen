export const createNew = (data?: any) => {
  console.log('createNew called', data);
};

export const onUploadImg = async (file: File | Blob, isBlob?: boolean) => {
  console.log('onUploadImg called', file, isBlob);
  return Promise.resolve('https://via.placeholder.com/150');
};
